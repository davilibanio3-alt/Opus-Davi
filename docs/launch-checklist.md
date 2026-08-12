# Launch Checklist — Revenue MVP

- [ ] Run typecheck/build for every workspace.
- [ ] Remove demo/simulated mining data from production paths.
- [ ] Verify Bitcoin Mainnet data sources and fail closed when unavailable.
- [ ] Add authentication and authorization around private dashboards.
- [ ] Keep secrets only in environment variables; never commit them.
- [ ] Add persistent database for users, subscriptions, workers and usage.
- [ ] Integrate a production payment provider before accepting paid subscriptions.
- [ ] Add webhook verification and idempotent subscription state updates.
- [ ] Add terms, privacy policy and clear risk disclosures.
- [ ] Configure production domain, TLS, backups and monitoring.
- [ ] Test payment, cancellation, renewal and failed-payment flows.
- [ ] Soft-launch to first users before public marketing.
