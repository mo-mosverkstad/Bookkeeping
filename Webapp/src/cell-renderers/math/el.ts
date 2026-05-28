export function el(tag: string, className?: string, children: (Node | string)[] = []): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const child of children) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    return node;
}
