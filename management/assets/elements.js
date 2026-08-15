export function createElement(tag, properties = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, properties);
  element.append(...children);
  return element;
}

export { createElement as create_element };

export function query(selector, root = document) {
  return root.querySelector(selector);
}

export function queryAll(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function preformatted(text) {
  return createElement("pre", { textContent: text });
}

export function setVisible(element, visible) {
  element.hidden = !visible;
  if (visible) element.style.removeProperty("display");
  else element.style.setProperty("display", "none", "important");
}

export function setVisibleAll(selector, visible, root = document) {
  queryAll(selector, root).forEach((element) => setVisible(element, visible));
}
