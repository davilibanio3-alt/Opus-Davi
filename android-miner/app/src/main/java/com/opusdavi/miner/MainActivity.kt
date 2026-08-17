package com.opusdavi.miner

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.*
import java.io.*
import java.math.BigInteger
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var host: EditText
    private lateinit var port: EditText
    private lateinit var user: EditText
    private lateinit var pass: EditText
    private lateinit var status: TextView
    private lateinit var stats: TextView
    private lateinit var start: Button
    private lateinit var stop: Button
    private var miner: StratumMiner? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24,24,24,24) }
        host = field("Pool host", "127.0.0.1")
        port = field("Pool port", "3333")
        user = field("Worker", "opusdavi.worker1")
        pass = field("Password", "x")
        status = TextView(this).apply { text = "Stopped" }
        stats = TextView(this).apply { textSize = 18f; text = "0 H/s\nShares: 0 / 0" }
        start = Button(this).apply { text = "START REAL MINING" }
        stop = Button(this).apply { text = "STOP"; isEnabled = false }
        box.addView(host); box.addView(port); box.addView(user); box.addView(pass)
        box.addView(status); box.addView(stats); box.addView(start); box.addView(stop)
        setContentView(box)
        start.setOnClickListener { startMiner() }
        stop.setOnClickListener { miner?.stop(); stop.isEnabled=false; start.isEnabled=true; status.text="Stopped" }
        handler.post(updateTask)
    }

    private fun field(label: String, value: String): EditText = EditText(this).apply {
        hint = label; setText(value); inputType = android.text.InputType.TYPE_CLASS_TEXT
    }

    private fun startMiner() {
        miner?.stop()
        miner = StratumMiner(host.text.toString().trim(), port.text.toString().toInt(), user.text.toString().trim(), pass.text.toString()).also {
            it.start()
        }
        start.isEnabled=false; stop.isEnabled=true; status.text="Connecting..."
    }

    private val updateTask = object : Runnable {
        override fun run() {
            miner?.let { m ->
                stats.text = "${formatHashrate(m.hashrate())}\nShares: ${m.accepted.get()} / ${m.rejected.get()}\nHashes: ${m.hashes.get()}"
                status.text = m.status
            }
            handler.postDelayed(this, 1000)
        }
    }

    private fun formatHashrate(h: Double): String = when {
        h >= 1e9 -> "%.2f GH/s".format(h/1e9)
        h >= 1e6 -> "%.2f MH/s".format(h/1e6)
        h >= 1e3 -> "%.2f kH/s".format(h/1e3)
        else -> "%.0f H/s".format(h)
    }

    override fun onDestroy() { miner?.stop(); super.onDestroy() }
}

private class StratumMiner(
    private val host: String,
    private val port: Int,
    private val username: String,
    private val password: String
) {
    val hashes = AtomicLong(0)
    val accepted = AtomicLong(0)
    val rejected = AtomicLong(0)
    private val running = AtomicBoolean(false)
    @Volatile var status = "Stopped"
    private var socket: Socket? = null
    private var writer: BufferedWriter? = null
    private var startNs = 0L
    private var lastHashes = 0L
    private var lastNs = 0L
    private val extranonce2Size = 4
    private var extranonce1 = ""
    private var job: Job? = null
    private var difficulty = 1.0
    private var requestId = 1L

    fun start() { if (running.compareAndSet(false,true)) thread(name="stratum") { runLoop() } }
    fun stop() { running.set(false); try { socket?.close() } catch (_: Exception) {}; status="Stopped" }

    fun hashrate(): Double {
        val now = System.nanoTime(); val h = hashes.get(); val ns = startNs
        if (ns == 0L) return 0.0
        val elapsed = (now - ns).toDouble()/1e9
        return if (elapsed > 0) h/elapsed else 0.0
    }

    private fun runLoop() {
        while (running.get()) {
            try {
                status="Connecting $host:$port"
                socket=Socket(host,port).apply { tcpNoDelay=true; soTimeout=0 }
                writer=BufferedWriter(OutputStreamWriter(socket!!.getOutputStream()))
                val reader=BufferedReader(InputStreamReader(socket!!.getInputStream()))
                send("mining.subscribe", listOf("OpusDaviMiner/1.0", "1.0"))
                send("mining.authorize", listOf(username,password))
                status="Subscribed"
                if (startNs==0L) { startNs=System.nanoTime(); lastNs=startNs }
                while (running.get()) {
                    val line=reader.readLine() ?: break
                    handle(line)
                }
            } catch (e: Exception) { if(running.get()) status="Disconnected: ${e.message}" }
            try { socket?.close() } catch (_:Exception) {}
            if (running.get()) Thread.sleep(2000)
        }
    }

    private fun send(method: String, params: List<Any?>) {
        val id=requestId++
        val p=params.joinToString(",") { json(it) }
        writer?.apply { write("{\"id\":$id,\"method\":\"$method\",\"params\":[$p]}\n"); flush() }
    }

    private fun json(v: Any?): String = when(v) {
        null -> "null"
        is Number -> v.toString()
        else -> "\"${v.toString().replace("\\","\\\\").replace("\"","\\\"")}\""
    }

    private fun handle(line: String) {
        try {
            if (line.contains("\"method\":\"mining.set_difficulty\"")) {
                difficulty=Regex("\\\"params\\\":\\[(.*?)\\]").find(line)?.groupValues?.get(1)?.toDoubleOrNull() ?: 1.0
                return
            }
            if (line.contains("\"method\":\"mining.notify\"")) { parseNotify(line); return }
            if (line.contains("\"result\":true")) { accepted.incrementAndGet(); return }
            if (line.contains("\"result\":false")) { rejected.incrementAndGet(); return }
            if (line.contains("\"result\":[")) {
                val m=Regex("\\\"result\\\":\\[(.*?)\\]").find(line)?.groupValues?.get(1)?.split(',') ?: return
                if (m.size >= 2) {
                    extranonce1=m[1].trim().trim('"')
                }
            }
        } catch (_:Exception) {}
    }

    // Lightweight parser for standard Stratum V1 mining.notify JSON. It expects string params.
    private fun parseNotify(line: String) {
        val paramsText=Regex("\\\"params\\\":\\[(.*)\\],\\\"id\\\"").find(line)?.groupValues?.get(1)
            ?: Regex("\\\"params\\\":\\[(.*)\\]\\}").find(line)?.groupValues?.get(1) ?: return
        val strings=Regex("\\\"((?:\\\\.|[^\\\"])*)\\\"").findAll(paramsText).map{it.groupValues[1]}.toList()
        if(strings.size < 9) return
        val branches = strings.drop(4).dropLast(3)
        job=Job(strings[0],strings[1],strings[2],strings[3],branches,strings[strings.size-3],strings[strings.size-2],strings[strings.size-1],strings[4+branches.size])
        mine(job!!)
    }

    private fun mine(j: Job) {
        val coinbase = j.coinbase1 + extranonce1 + "%08x".format(0) + j.coinbase2
        val coinHash=sha256d(hex(coinbase))
        var merkle=coinHash
        for (b in j.branches) merkle=sha256d(merkle + hex(b))
        val merkleHex=revHex(merkle).toHex()
        val prev=revHex(hex(j.prevhash)).toHex()
        val headerPrefix=hex(j.version).toHex()+prev+merkleHex+hex(j.ntime).toHex()+hex(j.nbits).toHex()
        val target=targetFromDifficulty(difficulty)
        thread(name="sha256d-worker") {
            var nonce=0L
            status="Mining"
            while(running.get() && job===j) {
                val header=hex(headerPrefix + "%08x".format(nonce and 0xffffffffL))
                val hash=sha256d(header)
                hashes.incrementAndGet()
                val value=BigInteger(1, reverse(hash))
                if(value <= target) submit(j, "%08x".format(nonce and 0xffffffffL), header, value <= networkTarget(j.nbits))
                nonce=(nonce+1) and 0xffffffffL
            }
        }
    }

    private fun submit(j: Job, nonce: String, header: ByteArray, block: Boolean) {
        send("mining.submit", listOf(username,j.id,"00000000",j.ntime,nonce))
        if(block) status="Valid network-target candidate submitted"
    }

    private fun targetFromDifficulty(d: Double): BigInteger {
        val diff1=BigInteger("00000000ffff0000000000000000000000000000000000000000000000000000",16)
        return diff1.divide(BigInteger.valueOf(maxOf(1.0,d).toLong()))
    }
    private fun networkTarget(bits:String):BigInteger {
        val b=bits.toLong(16); val exp=(b ushr 24).toInt(); val mant=b and 0x007fffff
        return BigInteger.valueOf(mant).shiftLeft(8*(exp-3))
    }
    private fun hex(s:String)=s.chunked(2).map{it.toInt(16).toByte()}.toByteArray()
    private fun sha256d(x:ByteArray):ByteArray { val md=MessageDigest.getInstance("SHA-256"); return md.digest(md.digest(x)) }
    private fun reverse(x:ByteArray)=x.reversedArray()
    private fun revHex(x:ByteArray)=x.reversedArray()
    private fun ByteArray.toHex()=joinToString(""){ "%02x".format(it.toInt() and 255) }

    private data class Job(val id:String,val prevhash:String,val coinbase1:String,val coinbase2:String,val branches:List<String>,val version:String,val nbits:String,val ntime:String,val clean:String)
}
