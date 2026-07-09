import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

// Our brand-aligned types
const typeList = [
  { key: "url", label: "URL", icon: "🔗", heading: "Website or Link" },
  { key: "pdf", label: "PDF", icon: "📄", heading: "PDF Document" },
  { key: "multiurl", label: "Multi-Link", icon: "📚", heading: "Multiple Links" },
  { key: "contact", label: "Contact", icon: "👤", heading: "Contact Card (vCard)" },
  { key: "text", label: "Text", icon: "📝", heading: "Plain Text" },
  { key: "app", label: "App", icon: "📱", heading: "App Store Link" },
  { key: "sms", label: "SMS", icon: "💬", heading: "Text Message" },
  { key: "email", label: "Email", icon: "✉️", heading: "Email Message" },
  { key: "phone", label: "Phone", icon: "📞", heading: "Phone Number" },
  { key: "wifi", label: "WiFi", icon: "📶", heading: "WiFi Network" },
] as const;

type QrType = typeof typeList[number]["key"];

// 13 templates — our own tasteful styles using our color system
const templates = [
  { id: 1, name: "Clean", frame: "bg-white border border-forest/15", qrColor: "#113b2c" },
  { id: 2, name: "Fresh", frame: "bg-mint border border-forest/10", qrColor: "#166534" },
  { id: 3, name: "Bold", frame: "bg-white border-2 border-forest", qrColor: "#0f172a" },
  { id: 4, name: "Warm", frame: "bg-[#fefaf0] border border-amber-200", qrColor: "#92400e" },
  { id: 5, name: "Night", frame: "bg-forest text-white border border-white/10", qrColor: "#f1f5f9" },
  { id: 6, name: "Soft", frame: "bg-white border border-forest/10 shadow-sm", qrColor: "#334155" },
  { id: 7, name: "Leaf", frame: "bg-[#f0fdf4] border border-leaf/30", qrColor: "#166534" },
  { id: 8, name: "Slate", frame: "bg-slate-50 border border-slate-200", qrColor: "#1e2937" },
  { id: 9, name: "Ocean", frame: "bg-white border border-sky-200", qrColor: "#0369a1" },
  { id: 10, name: "Minimal", frame: "bg-white border border-forest/5", qrColor: "#475569" },
  { id: 11, name: "Rich", frame: "bg-[#fff7ed] border border-orange-200", qrColor: "#9a3412" },
  { id: 12, name: "Deep", frame: "bg-white border border-forest", qrColor: "#111827" },
  { id: 13, name: "Calm", frame: "bg-[#f8fafc] border border-forest/10", qrColor: "#134e4a" },
];

type FormState = {
  type: QrType;
  selectedTemplate: number;
  // fields per type
  url: string;
  pdfUrl: string;
  multiUrls: string;
  contactFirst: string;
  contactLast: string;
  contactOrg: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  text: string;
  appName: string;
  appIos: string;
  appAndroid: string;
  smsPhone: string;
  smsMessage: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  phone: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiEncryption: "WPA" | "WEP" | "nopass";
  // styling - always available
  qrColor: string;
  logoData: string | null;
  logoSize: number;
};

const draftKey = "proqr-universal-draft";

function normalizeUrl(input: string): string {
  let u = (input || "").trim();
  if (!u) return "";

  // Strip any existing (even broken) protocol
  u = u.replace(/^https?:?\/\//i, "");
  u = u.replace(/^\/\//, "");

  if (!u) return "";
  return "https://" + u;
}

function buildPayload(f: FormState): string {
  switch (f.type) {
    case "url": {
      return normalizeUrl(f.url);
    }
    case "pdf": {
      return normalizeUrl(f.pdfUrl);
    }
    case "multiurl": {
      const urls = f.multiUrls
        .split(/[\n,]+/)
        .map(normalizeUrl)
        .filter(Boolean);
      return urls.join("\n");
    }
    case "contact": {
      const parts = ["BEGIN:VCARD", "VERSION:3.0"];
      const fn = [f.contactFirst, f.contactLast].filter(Boolean).join(" ");
      if (fn) parts.push(`FN:${fn}`);
      if (f.contactOrg) parts.push(`ORG:${f.contactOrg}`);
      if (f.contactPhone) parts.push(`TEL;TYPE=CELL:${f.contactPhone}`);
      if (f.contactEmail) parts.push(`EMAIL:${f.contactEmail}`);
      if (f.contactWebsite) parts.push(`URL:${f.contactWebsite}`);
      parts.push("END:VCARD");
      return parts.join("\n");
    }
    case "text": return f.text.trim();
    case "app": {
      const lines = [];
      if (f.appName) lines.push(f.appName);
      if (f.appIos) lines.push("iOS: " + f.appIos);
      if (f.appAndroid) lines.push("Android: " + f.appAndroid);
      return lines.join("\n");
    }
    case "sms":
      return f.smsPhone ? `SMSTO:${f.smsPhone}:${f.smsMessage || ""}`.replace(/:$/, "") : "";
    case "email":
      if (!f.emailTo) return "";
      return `MATMSG:TO:${f.emailTo};SUB:${f.emailSubject || ""};BODY:${f.emailBody || ""};;`;
    case "phone": return f.phone ? `tel:${f.phone}` : "";
    case "wifi": {
      const ssid = f.wifiSsid.trim();
      if (!ssid) return "";
      let p = `WIFI:S:${ssid};T:${f.wifiEncryption};`;
      if (f.wifiEncryption !== "nopass" && f.wifiPassword) p += `P:${f.wifiPassword};`;
      return p + ";";
    }
    default: return "";
  }
}

export function UniversalQrForm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const initial: FormState = {
    type: "url",
    selectedTemplate: 1,
    url: "", pdfUrl: "", multiUrls: "",
    contactFirst: "", contactLast: "", contactOrg: "", contactEmail: "", contactPhone: "", contactWebsite: "",
    text: "", appName: "", appIos: "", appAndroid: "",
    smsPhone: "", smsMessage: "",
    emailTo: "", emailSubject: "", emailBody: "",
    phone: "",
    wifiSsid: "", wifiPassword: "", wifiEncryption: "WPA",
    qrColor: "#113b2c",
    logoData: null,
    logoSize: 46,
  };

  const [form, setForm] = useState<FormState>(initial);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  const payload = useMemo(() => buildPayload(form), [form]);
  const currentTemplate = templates.find(t => t.id === form.selectedTemplate) || templates[0];

  // Persist draft
  useEffect(() => {
    const { logoData, ...rest } = form;
    try { localStorage.setItem(draftKey, JSON.stringify(rest)); } catch {}
  }, [form]);

  // Load draft
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm(prev => ({ ...prev, ...parsed, logoData: null }));
      } catch {}
    }
  }, []);

  // Render QR + apply logo
  useEffect(() => {
    if (!payload || !canvasRef.current) {
      setQrDataUrl("");
      return;
    }

    const render = async () => {
      try {
        await QRCode.toCanvas(canvasRef.current!, payload, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: "H",
          color: { dark: form.qrColor, light: "#ffffff" },
        });

        // Logo overlay
        if (form.logoData) {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = form.logoData!;
          });
          const c = canvasRef.current!;
          const ctx = c.getContext("2d")!;
          const s = form.logoSize;
          const x = (c.width - s) / 2;
          const y = (c.height - s) / 2;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x - 5, y - 5, s + 10, s + 10);
          ctx.drawImage(img, x, y, s, s);
        }

        setQrDataUrl(canvasRef.current!.toDataURL("image/png"));
        setError("");
      } catch (e) {
        setError("Failed to generate QR");
      }
    };
    render();
  }, [payload, form.qrColor, form.logoData, form.logoSize]);

  const update = (key: keyof FormState, value: any) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  function changeType(newType: QrType) {
    setForm(f => ({ ...f, type: newType }));
  }

  function applyTemplate(id: number) {
    const tmpl = templates.find(t => t.id === id)!;
    setForm(f => ({
      ...f,
      selectedTemplate: id,
      qrColor: tmpl.qrColor,
    }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Logo must be smaller than 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logoData", reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    update("logoData", null);
  }

  async function downloadPng() {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = "qr-code.png";
    a.click();
  }

  async function downloadStyledCard() {
    if (!previewRef.current) return;

    try {
      const el = previewRef.current;
      const clone = el.cloneNode(true) as HTMLDivElement;
      clone.style.position = 'fixed';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.zIndex = '-9999';
      clone.style.opacity = '0';
      clone.style.pointerEvents = 'none';

      // Calculate width and height from original
      const rect = el.getBoundingClientRect();
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;

      document.body.appendChild(clone);

      // Let layout settle
      await new Promise(resolve => setTimeout(resolve, 200));

      const data = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 3,
        style: {
          opacity: '1',
          transform: 'none'
        }
      });

      clone.remove();

      const a = document.createElement("a");
      a.href = data;
      a.download = "qr-styled.png";
      a.click();
    } catch (err) {
      console.error("Failed to download styled card:", err);
    }
  }

  async function copyPayload() {
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    // simple feedback
    const orig = document.activeElement;
    alert("Copied to clipboard");
  }

  function reset() {
    setForm(initial);
    setQrDataUrl("");
    setError("");
  }

  const isValid = !!payload;
  const activeTypeInfo = typeList.find(t => t.key === form.type)!;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Type selector - compact, our style */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {typeList.map(t => {
            const active = form.type === t.key;
            return (
              <button
                key={t.key}
                onClick={() => changeType(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium border transition ${active ? "bg-forest text-white border-forest" : "bg-white border-forest/15 hover:border-forest/40 text-forest"}`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form area */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-forest/10 bg-white p-5">
            <div className="font-black text-forest mb-4">{activeTypeInfo.heading}</div>

            {/* Dynamic fields per type */}
            {form.type === "url" && (
              <input type="text" value={form.url} onChange={e => update("url", e.target.value)} placeholder="https://yourwebsite.com" className="w-full rounded-2xl border border-forest/15 px-4 py-3 text-sm focus:border-forest" />
            )}

            {form.type === "pdf" && (
              <input type="text" value={form.pdfUrl} onChange={e => update("pdfUrl", e.target.value)} placeholder="https://example.com/file.pdf" className="w-full rounded-2xl border border-forest/15 px-4 py-3 text-sm" />
            )}

            {form.type === "multiurl" && (
              <>
                <textarea 
                  value={form.multiUrls} 
                  onChange={e => update("multiUrls", e.target.value)} 
                  placeholder="https://google.com&#10;https://yahoo.com" 
                  rows={3} 
                  className="w-full rounded-2xl border border-forest/15 px-4 py-3 text-sm" 
                />
                <p className="text-[11px] text-forest/60 mt-1.5">
                  The first link will usually open directly. Other links are shown as text. 
                  For best results with multiple links, use a dedicated QR scanner app (Google Lens or similar).
                </p>
              </>
            )}

            {form.type === "contact" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <input value={form.contactFirst} onChange={e => update("contactFirst", e.target.value)} placeholder="First name" className="rounded-2xl border px-3 py-2" />
                <input value={form.contactLast} onChange={e => update("contactLast", e.target.value)} placeholder="Last name" className="rounded-2xl border px-3 py-2" />
                <input value={form.contactOrg} onChange={e => update("contactOrg", e.target.value)} placeholder="Organization" className="rounded-2xl border px-3 py-2 col-span-2" />
                <input value={form.contactEmail} onChange={e => update("contactEmail", e.target.value)} placeholder="Email" className="rounded-2xl border px-3 py-2" />
                <input value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} placeholder="Phone" className="rounded-2xl border px-3 py-2" />
                <input value={form.contactWebsite} onChange={e => update("contactWebsite", e.target.value)} placeholder="Website" className="rounded-2xl border px-3 py-2 col-span-2" />
              </div>
            )}

            {form.type === "text" && (
              <textarea value={form.text} onChange={e => update("text", e.target.value)} placeholder="Your message or instructions..." rows={3} className="w-full rounded-2xl border border-forest/15 px-4 py-3 text-sm" />
            )}

            {form.type === "app" && (
              <div className="space-y-3 text-sm">
                <input value={form.appName} onChange={e => update("appName", e.target.value)} placeholder="App name" className="w-full rounded-2xl border px-3 py-2" />
                <input value={form.appIos} onChange={e => update("appIos", e.target.value)} placeholder="iOS App Store URL" className="w-full rounded-2xl border px-3 py-2" />
                <input value={form.appAndroid} onChange={e => update("appAndroid", e.target.value)} placeholder="Android Play Store URL" className="w-full rounded-2xl border px-3 py-2" />
              </div>
            )}

            {form.type === "sms" && (
              <div className="space-y-3">
                <input value={form.smsPhone} onChange={e => update("smsPhone", e.target.value)} placeholder="Phone number" className="w-full rounded-2xl border px-3 py-2" />
                <textarea value={form.smsMessage} onChange={e => update("smsMessage", e.target.value)} placeholder="Message (optional)" rows={2} className="w-full rounded-2xl border px-3 py-2 text-sm" />
              </div>
            )}

            {form.type === "email" && (
              <div className="space-y-3 text-sm">
                <input value={form.emailTo} onChange={e => update("emailTo", e.target.value)} placeholder="Recipient email" className="w-full rounded-2xl border px-3 py-2" />
                <input value={form.emailSubject} onChange={e => update("emailSubject", e.target.value)} placeholder="Subject" className="w-full rounded-2xl border px-3 py-2" />
                <textarea value={form.emailBody} onChange={e => update("emailBody", e.target.value)} placeholder="Message body" rows={2} className="w-full rounded-2xl border px-3 py-2 text-sm" />
              </div>
            )}

            {form.type === "phone" && (
              <input value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-2xl border px-3 py-2" />
            )}

            {form.type === "wifi" && (
              <div className="space-y-3 text-sm">
                <input value={form.wifiSsid} onChange={e => update("wifiSsid", e.target.value)} placeholder="Network name (SSID)" className="w-full rounded-2xl border px-3 py-2" />
                <input value={form.wifiPassword} onChange={e => update("wifiPassword", e.target.value)} placeholder="Password (leave empty for open)" className="w-full rounded-2xl border px-3 py-2" />
                <div className="flex gap-3">
                  <select value={form.wifiEncryption} onChange={e => update("wifiEncryption", e.target.value as any)} className="flex-1 rounded-2xl border px-3 py-2">
                    <option value="WPA">WPA / WPA2 / WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">Open network</option>
                  </select>
                </div>
              </div>
            )}


            {/* Honest note */}
            <div className="mt-4 text-[11px] text-forest/60 leading-snug">
              Static QR code. All data is encoded directly in the image. Works offline and never expires.
            </div>

            {/* Customization - restored */}
          <div className="mt-6 rounded-3xl border border-forest/10 bg-white p-5">
            <div className="font-semibold text-sm mb-3">Customize</div>

            <div className="flex flex-wrap gap-6 items-end">
              {/* QR Color */}
              <div>
                <div className="text-xs text-forest/70 mb-1">QR Color</div>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.qrColor} onChange={e => update("qrColor", e.target.value)} className="h-9 w-12 rounded border p-0.5" />
                  <input type="text" value={form.qrColor} onChange={e => update("qrColor", e.target.value)} className="w-24 text-sm font-mono rounded border px-2 py-1" />
                </div>
              </div>

              {/* Logo */}
              <div>
                <div className="text-xs text-forest/70 mb-1">Logo in center</div>
                {!form.logoData ? (
                  <label className="cursor-pointer inline-flex items-center text-sm font-medium border border-dashed border-forest/30 rounded-2xl px-4 py-1.5 hover:bg-mint/20">
                    Upload logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-leaf">Logo added</span>
                    <input type="range" min="28" max="80" value={form.logoSize} onChange={e => update("logoSize", Number(e.target.value))} />
                    <button onClick={removeLogo} className="text-xs text-red-600">Remove</button>
                  </div>
                )}
              </div>
            </div>
          </div>


          </div>
        </div>

        {/* Preview + Templates */}

        <div className="lg:col-span-7">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* QR Code Preview */}
            <div className="flex-1">
              <div ref={previewRef} className={`rounded-3xl p-6 transition-all h-full flex flex-col items-center justify-center ${currentTemplate.frame}`}>
                <div className="flex justify-center">
                  <div className="relative">
                    <canvas ref={canvasRef} width={300} height={300} className="rounded-2xl bg-white shadow-sm" />
                    {!isValid && (
                      <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-forest/50 bg-white/70 rounded-2xl">
                        Enter details to see your QR
                      </div>
                    )}
                  </div>
                </div>

                {isValid && (
                  <div className="mt-4 px-3 py-2 bg-white/70 rounded-xl text-[10px] text-forest/60 break-all font-mono max-w-[300px] text-center w-full">
                    {payload.length > 180 ? payload.slice(0, 177) + "..." : payload}
                  </div>
                )}
              </div>
            </div>

            {/* Template selector (Vertical Scroll) */}
            <div className="sm:w-48 flex flex-col">
              <div className="text-xs font-bold text-forest/70 mb-2 px-1">TEMPLATES</div>
              <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-2 custom-scrollbar" style={{ maxHeight: "calc(300px + 48px)" }}>
                {templates.map(t => {
                  const active = form.selectedTemplate === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-medium transition-colors ${active ? "border-forest bg-forest text-white" : "border-forest/15 bg-white hover:bg-mint/30"}`}
                      title={t.name}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={downloadPng} disabled={!isValid} className="rounded-full bg-forest px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">Download PNG</button>
            <button onClick={downloadStyledCard} disabled={!isValid} className="rounded-full border border-forest/20 px-5 py-2.5 text-sm font-bold">Download Card</button>
            <button onClick={copyPayload} disabled={!isValid} className="rounded-full border border-forest/15 px-5 py-2.5 text-sm font-bold">Copy content</button>
            <button onClick={reset} className="ml-auto text-sm text-forest/70 hover:text-forest">Reset</button>
          </div>

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-forest/50">
        Generated entirely in your browser. Nothing is uploaded or stored.
      </div>
    </div>
  );
}
