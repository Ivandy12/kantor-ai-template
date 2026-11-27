// Kantor AI: Dynamic Branding System
// Mengubah semua teks merek lama menjadi merek dinamis pilihan user (contoh: IvanAdha)
// Nama ini juga dipakai pada Batu Prasasti 3D di depan gerbang kantor

let currentBrand = "IvanAdha";

export function getBrandName(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("kantor_brand_name");
    if (saved && saved.trim()) return saved.trim();
    const envBrand = process.env.NEXT_PUBLIC_BRAND_NAME;
    if (envBrand && envBrand.trim()) return envBrand.trim();
  }
  return currentBrand;
}

export function setBrandName(name: string) {
  if (!name || !name.trim()) return;
  currentBrand = name.trim();
  if (typeof window !== "undefined") {
    localStorage.setItem("kantor_brand_name", currentBrand);
  }
}

const RE = /\b(Paperclip|Digital Strategi)\b/g;
const LEWATI = "script,style,code,pre,textarea,input,[contenteditable],.ProseMirror,.cm-editor,.monaco-editor";
const ATRIBUT = ["placeholder", "title", "aria-label", "alt"];

const ganti = (s: string) => s.replace(RE, getBrandName());

function prosesTeks(node: Node) {
  const v = node.nodeValue;
  if (!v || (!v.includes("Paperclip") && !v.includes("Digital Strategi")) || node.parentElement?.closest(LEWATI)) return;
  node.nodeValue = ganti(v);
}

function prosesElemen(el: Element) {
  if (el.closest(LEWATI)) return;
  for (const a of ATRIBUT) {
    const v = el.getAttribute(a);
    if (v && (v.includes("Paperclip") || v.includes("Digital Strategi"))) el.setAttribute(a, ganti(v));
  }
}

function proses(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return prosesTeks(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  prosesElemen(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) prosesTeks(n);
    else prosesElemen(n as Element);
    n = w.nextNode();
  }
}

export function startBranding() {
  const win = window as unknown as { __brandActive?: boolean };
  if (typeof window === "undefined" || win.__brandActive) return;
  win.__brandActive = true;
  const judul = () => {
    if (document.title.includes("Paperclip") || document.title.includes("Digital Strategi")) {
      document.title = ganti(document.title);
    }
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(proses);
      else proses(m.target);
    }
    judul();
  });
  proses(document.documentElement);
  judul();
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATRIBUT,
  });
}
