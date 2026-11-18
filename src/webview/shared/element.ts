export const element = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[Tag] => {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
};
