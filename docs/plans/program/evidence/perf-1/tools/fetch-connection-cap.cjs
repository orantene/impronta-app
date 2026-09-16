// Same as instrumentation.ts's installFetchConnectionCap, preloaded so the
// already-built `next start` picks it up without a rebuild.
const { Agent, setGlobalDispatcher } = require("undici");
setGlobalDispatcher(new Agent({ connections: Number(process.env.TULALA_FETCH_CONNECTIONS || 10), keepAliveTimeout: 30000 }));
