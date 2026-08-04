export function createElement(tag, properties = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, properties);
  element.append(...children);
  return element;
}

export { createElement as create_element };

export function setVisible(element, visible) {
  element.style.display = visible ? "" : "none";
}
