import { showModalError } from "./modal.js";
import {
  clearCredentials,
  getCredentials,
  getCurrentPanel,
  setSwitchBackPanel,
  showPanel,
} from "./state.js";

let activeRequests = 0;
let indicatorTimer;
const indicator = document.querySelector("#ajax_loading_indicator");

function beginRequest() {
  activeRequests += 1;
  if (activeRequests === 1) {
    indicatorTimer = window.setTimeout(() => {
      if (activeRequests) indicator.style.display = "block";
    }, 100);
  }
}

function endRequest() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (!activeRequests) {
    window.clearTimeout(indicatorTimer);
    indicator.style.display = "none";
  }
}

function encodeBody(data, headers) {
  if (typeof data === "string") {
    headers.set("Content-Type", "text/plain; charset=ascii");
    return data;
  }
  if (data == null) return undefined;
  headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
  return new URLSearchParams(data).toString();
}

async function parseResponse(response) {
  const type = response.headers.get("Content-Type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

export async function api(url, method, data, callback, callbackError, extraHeaders = {}) {
  let response;
  let parsed;
  let requestError;
  beginRequest();
  try {
    const headers = new Headers(extraHeaders);
    headers.set("X-Requested-With", "XMLHttpRequest");
    const credentials = getCredentials();
    if (credentials)
      headers.set(
        "Authorization",
        `Basic ${btoa(`${credentials.username}:${credentials.session_key}`)}`,
      );
    let requestUrl = `/admin${url}`;
    let body;
    if (method === "GET" && data && typeof data !== "string") {
      const query = new URLSearchParams(data).toString();
      if (query) requestUrl += `${requestUrl.includes("?") ? "&" : "?"}${query}`;
    } else body = encodeBody(data, headers);
    const options = {
      method,
      headers,
      cache: "no-store",
    };
    if (body !== undefined) options.body = body;
    response = await fetch(requestUrl, options);
    if (response.status !== 403) parsed = await parseResponse(response);
  } catch (error) {
    requestError = error;
  } finally {
    endRequest();
  }

  if (requestError) {
    if (callbackError) callbackError(String(requestError), { status: 0 });
    else showModalError("Error", "Something went wrong, sorry.");
    return false;
  }
  if (response.status === 403) {
    const panel = getCurrentPanel();
    clearCredentials();
    showPanel("login");
    document.dispatchEvent(new CustomEvent("s5mail:credentials-changed"));
    setSwitchBackPanel(panel);
    return false;
  }
  if (!response.ok) {
    if (callbackError) callbackError(parsed, response);
    else showModalError("Error", "Something went wrong, sorry.");
    return false;
  }
  if (parsed?.status === "error") showModalError("Error", parsed.message);
  else callback?.(parsed);
  return false;
}
