import { useEffect, useRef, useState, type FormEvent } from "react";
import { TOOL_OUTPUT_EVENT, TOOL_OUTPUT_SESSION_KEY, trackProductEvent } from "../lib/productEvents";
import type { WaitlistLang, WaitlistTool } from "../data/waitlist";

/**
 * Early-access offer for the optional "get paid" workspace. Appears only after
 * the user exports, shares, or copies from a document tool — never on page
 * load — and never gates the tool. Email goes to /api/waitlist; nothing else
 * from the tool is sent.
 */

const STATE_KEY = "proupiqr-waitlist";
const DISMISS_DAYS = 30;

const COPY: Record<WaitlistLang, Record<
  "eyebrow" | "title" | "body" | "placeholder" | "cta" | "sending" | "interview" | "fine" | "privacy" |
  "doneTitle" | "doneBody" | "notNow" | "close" | "emailLabel" | "invalid" | "failed" | "trackNow",
  string
>> = {
  en: {
    eyebrow: "Early access · free",
    title: "Know when this gets paid",
    body: "Coming soon: sync across phone and laptop, automatic WhatsApp reminders, and pay links for your clients. Every tool here stays free with no signup.",
    trackNow: "Track payments free right now →",
    placeholder: "you@example.com",
    cta: "Get early access",
    sending: "Saving…",
    interview: "I'm happy to answer 3 quick questions by email",
    fine: "Email only. Used to invite you; deleted within 12 months. No spam.",
    privacy: "Privacy",
    doneTitle: "You're on the list",
    doneBody: "We'll email you when early access opens.",
    notNow: "Not now",
    close: "Close",
    emailLabel: "Email address",
    invalid: "Enter a valid email address.",
    failed: "Couldn't save right now. Please try again.",
  },
  hi: {
    eyebrow: "अर्ली एक्सेस · मुफ्त",
    title: "जानिए पेमेंट कब आया",
    body: "जल्द आ रहा है: फोन और लैपटॉप पर सिंक, WhatsApp पर अपने-आप रिमाइंडर, और ग्राहकों के लिए पेमेंट लिंक। यहाँ के सभी टूल बिना साइनअप के मुफ्त रहेंगे।",
    trackNow: "अभी मुफ्त में पेमेंट ट्रैक करें →",
    placeholder: "you@example.com",
    cta: "अर्ली एक्सेस पाएं",
    sending: "सेव हो रहा है…",
    interview: "मैं ईमेल पर 3 छोटे सवालों के जवाब देने को तैयार हूँ",
    fine: "सिर्फ ईमेल। आपको आमंत्रित करने के लिए; 12 महीनों में हटा दिया जाएगा। कोई स्पैम नहीं।",
    privacy: "गोपनीयता",
    doneTitle: "आप सूची में हैं",
    doneBody: "अर्ली एक्सेस शुरू होने पर हम आपको ईमेल करेंगे।",
    notNow: "अभी नहीं",
    close: "बंद करें",
    emailLabel: "ईमेल पता",
    invalid: "सही ईमेल पता लिखें।",
    failed: "अभी सेव नहीं हो सका। फिर से कोशिश करें।",
  },
  ta: {
    eyebrow: "முன்கூட்டிய அணுகல் · இலவசம்",
    title: "பணம் எப்போது வந்தது என்று தெரிந்துகொள்ளுங்கள்",
    body: "விரைவில்: போன் மற்றும் லேப்டாப்பில் ஒத்திசைவு, தானியங்கி WhatsApp நினைவூட்டல்கள், வாடிக்கையாளர்களுக்கான பணம் செலுத்தும் இணைப்புகள். இங்குள்ள எல்லாக் கருவிகளும் பதிவு இல்லாமல் இலவசமாகவே இருக்கும்.",
    trackNow: "இப்போதே இலவசமாகப் பணத்தைக் கண்காணிக்கவும் →",
    placeholder: "you@example.com",
    cta: "முன்கூட்டிய அணுகலைப் பெறுக",
    sending: "சேமிக்கிறது…",
    interview: "மின்னஞ்சலில் 3 சிறு கேள்விகளுக்குப் பதில் சொல்லத் தயார்",
    fine: "மின்னஞ்சல் மட்டும். உங்களை அழைக்க மட்டுமே; 12 மாதங்களுக்குள் நீக்கப்படும். ஸ்பேம் இல்லை.",
    privacy: "தனியுரிமை",
    doneTitle: "நீங்கள் பட்டியலில் உள்ளீர்கள்",
    doneBody: "முன்கூட்டிய அணுகல் தொடங்கும்போது மின்னஞ்சல் அனுப்புவோம்.",
    notNow: "இப்போது வேண்டாம்",
    close: "மூடு",
    emailLabel: "மின்னஞ்சல் முகவரி",
    invalid: "சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.",
    failed: "இப்போது சேமிக்க முடியவில்லை. மீண்டும் முயலவும்.",
  },
  te: {
    eyebrow: "ముందస్తు యాక్సెస్ · ఉచితం",
    title: "చెల్లింపు ఎప్పుడు వచ్చిందో తెలుసుకోండి",
    body: "త్వరలో: ఫోన్, ల్యాప్‌టాప్‌లో సింక్, ఆటోమేటిక్ WhatsApp రిమైండర్‌లు, కస్టమర్‌ల కోసం పేమెంట్ లింక్‌లు. ఇక్కడి అన్ని టూల్స్ సైన్అప్ లేకుండా ఉచితంగానే ఉంటాయి.",
    trackNow: "ఇప్పుడే ఉచితంగా చెల్లింపులు ట్రాక్ చేయండి →",
    placeholder: "you@example.com",
    cta: "ముందస్తు యాక్సెస్ పొందండి",
    sending: "సేవ్ అవుతోంది…",
    interview: "ఈమెయిల్‌లో 3 చిన్న ప్రశ్నలకు సమాధానం ఇవ్వడానికి సిద్ధం",
    fine: "ఈమెయిల్ మాత్రమే. మిమ్మల్ని ఆహ్వానించడానికి; 12 నెలల్లో తొలగిస్తాం. స్పామ్ లేదు.",
    privacy: "గోప్యత",
    doneTitle: "మీరు జాబితాలో ఉన్నారు",
    doneBody: "ముందస్తు యాక్సెస్ ప్రారంభమైనప్పుడు ఈమెయిల్ చేస్తాం.",
    notNow: "ఇప్పుడు వద్దు",
    close: "మూసివేయి",
    emailLabel: "ఈమెయిల్ చిరునామా",
    invalid: "సరైన ఈమెయిల్ చిరునామా నమోదు చేయండి.",
    failed: "ఇప్పుడు సేవ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
  },
  mr: {
    eyebrow: "अर्ली ॲक्सेस · मोफत",
    title: "पेमेंट कधी आलं ते जाणून घ्या",
    body: "लवकरच: फोन आणि लॅपटॉपवर सिंक, WhatsApp वर आपोआप रिमाइंडर, आणि ग्राहकांसाठी पेमेंट लिंक. इथली सर्व साधने साइनअपशिवाय मोफतच राहतील.",
    trackNow: "आत्ताच मोफत पेमेंट ट्रॅक करा →",
    placeholder: "you@example.com",
    cta: "अर्ली ॲक्सेस मिळवा",
    sending: "सेव्ह होत आहे…",
    interview: "ईमेलवर 3 छोट्या प्रश्नांची उत्तरे द्यायला मी तयार आहे",
    fine: "फक्त ईमेल. तुम्हाला आमंत्रित करण्यासाठी; 12 महिन्यांत हटवला जाईल. स्पॅम नाही.",
    privacy: "गोपनीयता",
    doneTitle: "तुम्ही यादीत आहात",
    doneBody: "अर्ली ॲक्सेस सुरू झाल्यावर आम्ही तुम्हाला ईमेल करू.",
    notNow: "आता नको",
    close: "बंद करा",
    emailLabel: "ईमेल पत्ता",
    invalid: "योग्य ईमेल पत्ता लिहा.",
    failed: "आत्ता सेव्ह करता आले नाही. पुन्हा प्रयत्न करा.",
  },
};

type Stored = { state: "joined" | "dismissed"; at: number };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    return value && (value.state === "joined" || value.state === "dismissed") && typeof value.at === "number" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(state: Stored["state"]): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, at: Date.now() }));
  } catch {
    // Storage blocked: the card simply may show again next session.
  }
}

function suppressed(): boolean {
  const stored = readStored();
  if (!stored) return false;
  if (stored.state === "joined") return true;
  return Date.now() - stored.at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function WaitlistCard({ tool, lang = "en" }: { tool: WaitlistTool; lang?: WaitlistLang }) {
  const t = COPY[lang] ?? COPY.en;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [interview, setInterview] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const viewed = useRef(false);

  useEffect(() => {
    if (suppressed()) return;
    const show = () => {
      if (suppressed()) return;
      setOpen(true);
      if (!viewed.current) {
        viewed.current = true;
        trackProductEvent("waitlist_view", tool);
      }
    };
    try {
      if (sessionStorage.getItem(TOOL_OUTPUT_SESSION_KEY) === tool) show();
    } catch {
      // sessionStorage blocked; rely on the live event.
    }
    const onOutput = (event: Event) => {
      if ((event as CustomEvent<{ tool?: string }>).detail?.tool === tool) show();
    };
    window.addEventListener(TOOL_OUTPUT_EVENT, onOutput);
    return () => window.removeEventListener(TOOL_OUTPUT_EVENT, onOutput);
  }, [tool]);

  if (!open) return null;

  function dismiss() {
    if (status !== "done") {
      writeStored("dismissed");
      trackProductEvent("waitlist_dismiss", tool);
    }
    setOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError(t.invalid);
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/waitlist/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, tool, lang, interview, company }),
      });
      if (!response.ok) throw new Error(String(response.status));
      writeStored("joined");
      trackProductEvent("waitlist_join", tool);
      setStatus("done");
    } catch {
      setError(t.failed);
      setStatus("error");
    }
  }

  const privacyHref = lang === "hi" ? "/hi/privacy/#early-access" : "/privacy/#early-access";
  // Letter-spacing breaks Indic conjuncts; keep the spaced caps look for English only.
  const eyebrow = `text-xs font-black text-leaf ${lang === "en" ? "uppercase tracking-[0.2em]" : ""}`;

  return (
    <aside
      aria-labelledby="waitlist-title"
      className="no-print fixed inset-x-3 z-40 mx-auto max-w-md rounded-[1.5rem] border border-forest/10 bg-white p-5 text-forest shadow-[0_24px_60px_rgba(17,59,44,0.22)] sm:inset-x-auto sm:right-6"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.close}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-forest/50 transition hover:bg-mint hover:text-forest"
      >
        ×
      </button>

      {status === "done" ? (
        <div role="status" className="pr-6">
          <p className={eyebrow}>{t.eyebrow}</p>
          <h2 id="waitlist-title" className="mt-2 text-lg font-black">✓ {t.doneTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-forest/75">{t.doneBody}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className={`pr-8 ${eyebrow}`}>{t.eyebrow}</p>
          <h2 id="waitlist-title" className="mt-2 pr-6 text-lg font-black leading-snug">{t.title}</h2>
          <p className="mt-1 text-sm leading-6 text-forest/75">{t.body}</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="waitlist-email">{t.emailLabel}</label>
            <input
              id="waitlist-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
              placeholder={t.placeholder}
              aria-invalid={status === "error" ? true : undefined}
              aria-describedby={status === "error" ? "waitlist-error" : undefined}
              className="min-w-0 flex-1 rounded-xl border border-forest/15 bg-[#fffdf6] px-3 py-2.5 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-xl bg-forest px-4 py-2.5 text-sm font-black text-white transition hover:bg-leaf disabled:opacity-60"
            >
              {status === "sending" ? t.sending : t.cta}
            </button>
          </div>

          {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />

          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-forest/80">
            <input
              type="checkbox"
              checked={interview}
              onChange={(e) => setInterview(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#287a57]"
            />
            {t.interview}
          </label>

          {status === "error" && error && (
            <p id="waitlist-error" role="alert" className="mt-2 text-xs font-bold text-red-700">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] leading-4 text-forest/55">
            <p>
              {t.fine} <a href={privacyHref} className="font-bold underline hover:text-leaf">{t.privacy}</a>
            </p>
            <button type="button" onClick={dismiss} className="shrink-0 font-bold text-forest/70 underline hover:text-forest">
              {t.notNow}
            </button>
          </div>
          <a href={lang === "hi" ? "/app/?lang=hi" : "/app/"} className="mt-3 block rounded-xl bg-mint/60 px-3 py-2 text-center text-xs font-black text-leaf hover:bg-mint">{t.trackNow}</a>
        </form>
      )}
    </aside>
  );
}
