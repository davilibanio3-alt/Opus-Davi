/** @type {import('next').NextConfig} */
const isGhPages = process.env.NEXT_PUBLIC_GH_PAGES === "1";
const repo = "Opus-Davi";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  basePath: isGhPages ? `/${repo}` : undefined,
  assetPrefix: isGhPages ? `/${repo}/` : undefined,
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };
    if (!isServer) {
      // tiny-secp256k1's wasm loader checks for `node:fs` etc. Falling back is enough.
      config.module.rules.push({
        test: /\.wasm$/,
        type: "webassembly/async",
      });
    }
    return config;
  },
};

export default nextConfig;
