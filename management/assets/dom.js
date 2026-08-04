function nodesFrom(value) {
  if (value instanceof DomList) return [...value];
  if (value instanceof Node) return [value];
  if (typeof value === "string") return [...document.querySelectorAll(value)];
  if (value && Symbol.iterator in Object(value)) return [...value];
  return [];
}

function fragment(markup) {
  const tag = markup.match(/^\s*<([a-z]+)/i)?.[1]?.toLowerCase();
  const wrappers = {
    tr: ["<table><tbody>", "</tbody></table>", "tbody"],
    td: ["<table><tbody><tr>", "</tr></tbody></table>", "tr"],
    th: ["<table><tbody><tr>", "</tr></tbody></table>", "tr"],
    option: ["<select>", "</select>", "select"],
  };
  const [prefix, suffix, selector] = wrappers[tag] || ["", "", "body"];
  const parsed = new DOMParser().parseFromString(`${prefix}${markup}${suffix}`, "text/html");
  const result = document.createDocumentFragment();
  result.append(...parsed.querySelector(selector).childNodes);
  return result;
}

class DomList extends Array {
  text(value) {
    if (value === undefined) return this[0]?.textContent || "";
    this.forEach((node) => (node.textContent = value));
    return this;
  }

  html(value) {
    if (value === undefined) return "";
    this.forEach((node) => node.replaceChildren(fragment(value).cloneNode(true)));
    return this;
  }

  val(value) {
    if (value === undefined) return this[0]?.value;
    this.forEach((node) => (node.value = value));
    return this;
  }

  attr(name, value) {
    if (value === undefined) return this[0]?.getAttribute(name);
    this.forEach((node) => node.setAttribute(name, value));
    return this;
  }

  removeAttr(name) {
    this.forEach((node) => node.removeAttribute(name));
    return this;
  }

  prop(name, value) {
    if (value === undefined) return this[0]?.[name];
    this.forEach((node) => (node[name] = value));
    return this;
  }

  append(value) {
    this.forEach((parent, index) => {
      for (const child of nodesFrom(value)) parent.append(index ? child.cloneNode(true) : child);
    });
    return this;
  }

  find(selector) {
    selector = selector.replaceAll("option:selected", "option:checked");
    const scoped = selector.startsWith(">") ? `:scope ${selector}` : selector;
    return dom(this.flatMap((node) => [...node.querySelectorAll(scoped)]));
  }

  parents(selector) {
    return dom(this.map((node) => node.closest(selector)).filter(Boolean));
  }

  parent() {
    return dom(this.map((node) => node.parentElement).filter(Boolean));
  }

  clone() {
    return dom(this.map((node) => node.cloneNode(true)));
  }

  addClass(names) {
    this.forEach((node) => node.classList.add(...names.split(/\s+/)));
    return this;
  }

  removeClass(names) {
    this.forEach((node) => node.classList.remove(...names.split(/\s+/)));
    return this;
  }

  show() {
    this.forEach((node) => (node.style.display = ""));
    return this;
  }

  hide() {
    this.forEach((node) => (node.style.display = "none"));
    return this;
  }

  toggle(show) {
    this.forEach((node) => {
      node.style.display = (show ?? node.style.display !== "none") ? "" : "none";
    });
    return this;
  }

  remove() {
    this.forEach((node) => node.remove());
    return this;
  }

  focus() {
    this[0]?.focus();
    return this;
  }

  on(event, handler) {
    this.forEach((node) => node.addEventListener(event.split(".")[0], handler));
    return this;
  }

  off(event, handler) {
    this.forEach((node) => node.removeEventListener(event.split(".")[0], handler));
    return this;
  }

  click(handler) {
    if (handler) return this.on("click", handler);
    this[0]?.click();
    return this;
  }

  each(callback) {
    this.forEach((node, index) => callback(index, node));
    return this;
  }

  get(index) {
    return this[index];
  }

  offset() {
    const rect = this[0]?.getBoundingClientRect();
    return { top: (rect?.top || 0) + window.scrollY, left: (rect?.left || 0) + window.scrollX };
  }

  height() {
    return this[0]?.getBoundingClientRect().height || 0;
  }

  animate(properties, _duration, callback) {
    if ("scrollTop" in properties) window.scrollTo({ top: properties.scrollTop });
    Object.assign(this[0]?.style || {}, properties);
    callback?.call(this[0]);
    return this;
  }

  fadeIn() {
    return this.show();
  }
  fadeOut(_duration, callback) {
    this.hide();
    callback?.();
    return this;
  }
  slideDown() {
    return this.show();
  }
  slideUp() {
    return this.hide();
  }
  stop() {
    return this;
  }
}

export function dom(value) {
  if (typeof value === "function") {
    value();
    return new DomList();
  }
  if (typeof value === "string" && value.trimStart().startsWith("<")) {
    return new DomList(...fragment(value).childNodes);
  }
  return new DomList(...nodesFrom(value));
}

dom.each = (values, callback) =>
  Object.entries(values).forEach(([key, value]) => callback(key, value));
dom.trim = (value) => value.trim();
