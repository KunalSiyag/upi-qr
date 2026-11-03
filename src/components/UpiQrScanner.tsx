import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { SCANNER_PHRASES } from "../data/scannerPhrases";
import { localTranslator } from "../lib/localPhrases";
import { FIELD_LABELS, FLAG_TEMPLATES, fillTemplate, readPayload, sameUpiId, type ReadFlag, type ReadResult } from "../lib/upi-qr-read";

/**
 * UPI QR scanner: camera, photo or pasted text in, fields and notes out. Everything runs in the browser: no
 * network request, no storage, no analytics event. Frames are read and dropped; the camera starts only on a
 * tap and its tracks stop on Stop, on a read, when the page is hidden and when the component unmounts.
 * Results are rendered as text only, nothing is linked and nothing is opened.
 */

type Source = "camera" | "photo" | "paste";
interface Status {
  source: Source;
  text: string;
  problem: boolean;
}
type Inversion = "dontInvert" | "attemptBoth";
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: Inversion }) => { data: string } | null;
interface QrDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = { new (options: { formats: string[] }): QrDetector; getSupportedFormats?: () => Promise<string[]> };

/**
 * English text in, the page language out. The copy sits in scannerPhrases.ts, not phrases.ts, so this island does not
 * pull in the chunk every other tool shares; other languages show the English text.
 */
function regionalLang(lang: DocLang): "hi" | "ta" | "te" | "mr" | null {
  return lang === "hi" || lang === "ta" || lang === "te" || lang === "mr" ? lang : null;
}

const SCAN_INTERVAL_MS = 125; // about 8 frames a second
const LIVE_MAX_SIDE = 640;

let detectorPromise: Promise<QrDetector | null> | undefined;
/** The browser's own QR reader when it has one; null means use jsQR. */
function nativeDetector(): Promise<QrDetector | null> {
  detectorPromise ??= (async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (Ctor === undefined) return null;
    try {
      const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : ["qr_code"];
      return formats.includes("qr_code") ? new Ctor({ formats: ["qr_code"] }) : null;
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

/** The QR reader chunk did not download (offline, say). A failed dynamic import stays failed until the page reloads. */
class ReaderLoadError extends Error {}

async function loadJsQr(): Promise<JsQr> {
  try {
    return (await import("jsqr")).default as unknown as JsQr;
  } catch {
    throw new ReaderLoadError("jsqr");
  }
}


/** Draws a source onto the canvas at most `maxSide` pixels wide or tall and runs jsQR on the pixels. */
function readCanvas(canvas: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number, maxSide: number, jsQR: JsQr, inversion: Inversion): string | null {
  if (width === 0 || height === 0) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(source, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  const data = jsQR(pixels.data, w, h, { inversionAttempts: inversion })?.data;
  return data === undefined || data === "" ? null : data;
}

/** Reads a photo: the browser's reader first, then jsQR at two sizes (a smaller copy often reads better). */
async function decodeImageFile(file: File): Promise<string | null> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = (): void => undefined;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    release = () => URL.revokeObjectURL(url);
  }
  try {
    const native = await nativeDetector();
    if (native !== null) {
      try {
        const codes = await native.detect(source);
        if (codes.length > 0 && codes[0].rawValue !== "") return codes[0].rawValue;
      } catch {
        // fall through to jsQR
      }
    }
    const jsQR = await loadJsQr();
    const canvas = document.createElement("canvas");
    for (const side of [1600, 800]) {
      const text = readCanvas(canvas, source, width, height, side, jsQR, "attemptBoth");
      if (text !== null) return text;
    }
    return null;
  } finally {
    release();
  }
}

function cameraProblem(error: unknown, tr: (english: string) => string): string {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return tr("The browser blocked the camera. Allow camera access for this site in your browser settings, or use a photo or pasted text instead.");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return tr("No camera was found on this device. Use a photo or pasted text instead.");
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return tr("The camera could not start. Another app may be using it. Close other apps that use the camera and try again, or use a photo or pasted text instead.");
  }
  return tr("The camera could not start. Use a photo or pasted text instead.");
}

function renderFlag(flag: ReadFlag, tr: (english: string) => string): string {
  return fillTemplate(tr(FLAG_TEMPLATES[flag.code]), flag.args);
}

const SUMMARY_KEYS: Record<ReadResult["kind"], string[]> = {
  "upi-pay": ["pa", "pn", "am"],
  "upi-mandate": ["pa", "pn", "am"],
  emv: ["59", "60", "54"],
  url: ["site"],
  other: [],
};
const MONO_KEYS = new Set(["pa", "url", "site", "address", "tr", "tid", "sign", "mode", "orgid", "mc", "mid", "msid", "mtid"]);

const card = "rounded-[12px] border border-forest/10 bg-white p-5 sm:p-6";
const heading = "text-lg font-semibold text-forest";
const help = "mt-2 text-sm leading-6 text-charcoal";
const primary =
  "inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-graphite";
const secondary =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] bg-white px-5 py-3 text-sm font-semibold text-forest ring-1 ring-forest/15 transition hover:ring-forest/30 active:scale-[0.97]";
const field =
  "mt-2 w-full rounded-[10px] border border-forest/15 bg-white px-4 py-3 text-base text-forest placeholder:text-forest/65 focus:border-leaf";
const focusRing = "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-leaf";

export function UpiQrScanner({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, SCANNER_PHRASES), [lang]);
  const id = useId();
  const [expected, setExpected] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<ReadResult | null>(null);
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const [status, setStatus] = useState<Status | null>(null);
  const [reading, setReading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const runRef = useRef(0); // each camera start gets a number; changing it cancels the loop and a start still waiting for permission
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);

  const disclaimerHref = lang === "hi" ? "/hi/disclaimer/" : "/disclaimer/";

  const stopCamera = useCallback((message?: string) => {
    runRef.current += 1;
    cancelAnimationFrame(frameRef.current);
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) for (const track of stream.getTracks()) track.stop();
    const video = videoRef.current;
    if (video !== null) {
      video.pause();
      video.srcObject = null;
    }
    setCamera("off");
    if (message !== undefined) setStatus({ source: "camera", text: message, problem: false });
  }, []);

  const finish = useCallback(
    (text: string, source: Source) => {
      stopCamera();
      setResult(readPayload(text));
      setStatus({ source, text: source === "camera" ? tr("QR code read. The camera has stopped.") : tr("QR code read."), problem: false });
    },
    [stopCamera, tr],
  );

  const scanLoop = useCallback(
    async (run: number, video: HTMLVideoElement) => {
      let native: QrDetector | null = null;
      let jsQR: JsQr | null = null;
      try {
        native = await nativeDetector();
        if (native === null) jsQR = await loadJsQr();
      } catch (error) {
        if (runRef.current === run) {
          stopCamera();
          const text = error instanceof ReaderLoadError ? tr("The QR reader could not load. Check your connection and reload the page, or use pasted text instead.") : tr("The camera could not start. Use a photo or pasted text instead.");
          setStatus({ source: "camera", text, problem: true });
        }
        return;
      }
      if (runRef.current !== run) return;
      const canvas = document.createElement("canvas");
      let last = 0;
      let busy = false;
      const tick = (now: number) => {
        if (runRef.current !== run) return;
        frameRef.current = requestAnimationFrame(tick);
        if (busy || now - last < SCAN_INTERVAL_MS || video.readyState < 2) return;
        last = now;
        busy = true;
        const look = async (): Promise<string | null> => {
          if (native !== null) {
            try {
              const codes = await native.detect(video);
              return codes[0]?.rawValue || null;
            } catch {
              native = null; // the browser's reader failed (no barcode service on this device, say): jsQR takes over for this scan
            }
          }
          jsQR ??= await loadJsQr();
          return readCanvas(canvas, video, video.videoWidth, video.videoHeight, LIVE_MAX_SIDE, jsQR, "dontInvert");
        };
        look()
          .catch(() => null)
          .then((text) => {
            busy = false;
            if (text !== null && runRef.current === run) finish(text, "camera");
          });
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [finish, stopCamera, tr],
  );

  const startCamera = useCallback(async () => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!window.isSecureContext || media === undefined || typeof media.getUserMedia !== "function") {
      setStatus({ source: "camera", text: tr("This browser cannot use the camera on this page. Use a photo or pasted text instead."), problem: true });
      return;
    }
    const run = ++runRef.current;
    setResult(null);
    setCamera("starting");
    setStatus({ source: "camera", text: tr("Starting the camera…"), problem: false });
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (error) {
      if (runRef.current !== run) return;
      setCamera("off");
      setStatus({ source: "camera", text: cameraProblem(error, tr), problem: true });
      return;
    }
    const video = videoRef.current;
    if (runRef.current !== run || video === null) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    streamRef.current = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Some browsers refuse autoplay; frames still arrive once the picture is shown.
    }
    if (runRef.current !== run) return;
    setCamera("on");
    setStatus({ source: "camera", text: tr("Camera is on. Hold a QR code steady in the frame."), problem: false });
    void scanLoop(run, video);
  }, [scanLoop, tr]);

  const readFile = useCallback(
    async (file: File | undefined) => {
      if (file === undefined) return;
      stopCamera();
      setReading(true);
      setStatus({ source: "photo", text: tr("Reading the photo…"), problem: false });
      try {
        const text = await decodeImageFile(file);
        if (text === null) {
          setStatus({ source: "photo", text: tr("No QR code was found in that photo. Move closer, keep the whole code in view with good light, and try again."), problem: true });
        } else {
          finish(text, "photo");
        }
      } catch (error) {
        const text = error instanceof ReaderLoadError ? tr("The QR reader could not load. Check your connection and reload the page, or use pasted text instead.") : tr("That file could not be read as an image. Try another photo.");
        setStatus({ source: "photo", text, problem: true });
      } finally {
        setReading(false);
      }
    },
    [finish, stopCamera, tr],
  );

  const readPasted = () => {
    if (pasteText.trim() === "") {
      setStatus({ source: "paste", text: tr("Paste some text first."), problem: true });
      return;
    }
    finish(pasteText, "paste");
  };

  const scanAnother = () => {
    setResult(null);
    setStatus(null);
    setPasteText("");
    startRef.current?.focus();
  };

  // The camera stops when the page is hidden or left, and when this component goes away.
  useEffect(() => {
    if (camera === "off") return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopCamera(tr("Camera stopped because the page was hidden."));
    };
    const onPageHide = () => stopCamera();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [camera, stopCamera, tr]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  // A new read moves focus to its heading, so a keyboard or screen-reader user lands on it.
  useEffect(() => {
    if (result === null || headingRef.current === null) return;
    headingRef.current.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    headingRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [result]);

  const statusFor = (source: Source) => {
    const shown = status !== null && status.source === source ? status : null;
    return (
      <p
        role="status"
        aria-live="polite"
        data-scanner-status={source}
        className={`mt-3 min-h-[1.5rem] text-sm leading-6 ${shown?.problem ? "border-l-4 border-coral pl-3 text-forest" : "text-charcoal"}`}
      >
        {shown?.text ?? ""}
      </p>
    );
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    void readFile(file);
  };

  const cameraBusy = camera !== "off";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" lang={regionalLang(lang) ?? "en"}>
      <p data-scanner-notice className="rounded-[10px] bg-fog px-4 py-3 text-sm font-semibold leading-6 text-forest">
        {tr("Camera frames are processed on your device and never uploaded or saved. Check the payee name your UPI app shows before you pay.")}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${card} lg:row-span-2`} aria-labelledby={`${id}-camera`}>
          <h2 id={`${id}-camera`} className={heading}>{tr("Scan with your camera")}</h2>
          <p id={`${id}-camera-note`} className={help}>{tr("The camera starts only when you tap the button, and its pictures stay on this device.")}</p>
          <div className="mt-4">
            <button
              ref={startRef}
              type="button"
              data-scanner-start
              aria-describedby={`${id}-camera-note`}
              className={`${cameraBusy ? secondary : primary} scroll-mt-40`}
              onClick={() => (cameraBusy ? stopCamera(tr("Camera stopped.")) : void startCamera())}
            >
              {cameraBusy ? tr("Stop camera") : tr("Start camera")}
            </button>
          </div>
          {statusFor("camera")}
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-ink">
            <video
              ref={videoRef}
              aria-label={tr("Camera preview")}
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-contain ${camera === "on" ? "" : "invisible"}`}
            />
            {camera !== "on" && (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm leading-6 text-white/85">
                {tr("Camera preview appears here after you tap Start camera.")}
              </p>
            )}
          </div>
        </section>

        <section
          className={card}
          aria-labelledby={`${id}-photo`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readFile(event.dataTransfer.files[0]);
          }}
        >
          <h2 id={`${id}-photo`} className={heading}>{tr("Use a photo of the QR")}</h2>
          <p className={help}>{tr("Photos are read in your browser. They are not uploaded or saved. You can also drop an image here.")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span>
              <input id={`${id}-take`} data-scanner-take type="file" accept="image/*" capture="environment" className="peer sr-only" onChange={onFileChange} disabled={reading} />
              <label htmlFor={`${id}-take`} className={`${secondary} ${focusRing}`}>{tr("Take a photo")}</label>
            </span>
            <span>
              <input id={`${id}-pick`} data-scanner-pick type="file" accept="image/*" className="peer sr-only" onChange={onFileChange} disabled={reading} />
              <label htmlFor={`${id}-pick`} className={`${secondary} ${focusRing}`}>{tr("Choose an image")}</label>
            </span>
          </div>
          {statusFor("photo")}
        </section>

        <section className={card} aria-labelledby={`${id}-paste`}>
          <h2 id={`${id}-paste`} className={heading}>{tr("Paste the QR text")}</h2>
          <p className={help}>{tr("Paste a upi:// link or the text another QR reader gave you.")}</p>
          <label htmlFor={`${id}-paste-input`} className="mt-4 block text-sm font-semibold leading-6 text-forest">{tr("Link or text from the QR")}</label>
          <textarea
            id={`${id}-paste-input`}
            data-scanner-paste
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            dir="ltr"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            onPaste={(event) => {
              const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
              if (image !== undefined) {
                event.preventDefault();
                void readFile(image);
              }
            }}
            placeholder="upi://pay?pa=name@bank&pn=Name"
            className={`${field} font-mono`}
          />
          <div className="mt-3">
            <button type="button" data-scanner-read className={secondary} onClick={readPasted}>{tr("Read this text")}</button>
          </div>
          {statusFor("paste")}
        </section>
      </div>

      {result !== null && (
        <ResultCard
          result={result}
          expected={expected}
          onExpected={setExpected}
          tr={tr}
          headingRef={headingRef}
          onAgain={scanAnother}
        />
      )}

      <p className="text-xs leading-5 text-charcoal">
        {tr("Independent tool, not affiliated with NPCI, any bank or any UPI app.")}{" "}
        <a href={disclaimerHref} className="font-semibold text-leaf underline">{tr("Disclaimer")}</a>
      </p>
    </div>
  );
}

function ResultCard({
  result,
  expected,
  onExpected,
  tr,
  headingRef,
  onAgain,
}: {
  result: ReadResult;
  expected: string;
  onExpected: (value: string) => void;
  tr: (english: string) => string;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onAgain: () => void;
}) {
  const expectedId = useId();
  const comparable = result.kind === "upi-pay" || result.kind === "upi-mandate";
  const withKeys = comparable || result.kind === "emv";
  const summaryKeys = SUMMARY_KEYS[result.kind];
  const isSummary = (f: ReadResult["fields"][number]) => summaryKeys.includes(f.key) && f.label !== FIELD_LABELS.repeated && f.label !== FIELD_LABELS.other;
  const summary = summaryKeys.flatMap((key) => result.fields.filter((f) => f.key === key && isSummary(f)).slice(0, 1));
  const rest = result.fields.filter((f) => !summary.includes(f));
  const warns = result.flags.filter((flag) => flag.level === "warn");
  const infos = result.flags.filter((flag) => flag.level === "info");
  const typed = expected.trim() !== "";

  const row = (f: ReadResult["fields"][number], index: number, big: boolean) => {
    const empty = f.value === "";
    const mono = MONO_KEYS.has(f.key) && f.label !== FIELD_LABELS.repeated && f.label !== FIELD_LABELS.other;
    return (
      <React.Fragment key={`${f.key}-${index}`}>
        <dt className="text-sm text-charcoal">
          {tr(f.label)}
          {withKeys && <span dir="ltr" className="ml-2 font-mono text-xs text-charcoal">{f.key}</span>}
        </dt>
        <dd className={`min-w-0 break-words ${big ? "text-base font-semibold" : "text-sm"} text-forest ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : "auto"}>
          {empty ? (
            <span className="font-normal italic text-charcoal">
              {f.key === "am" && result.kind === "upi-pay" ? tr("Not set in the QR: you type the amount in your UPI app") : tr("Not in the QR")}
            </span>
          ) : (
            f.value
          )}
        </dd>
      </React.Fragment>
    );
  };
  const list = "grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]";

  return (
    <section data-scanner-result className={card} aria-labelledby="scanner-result-heading">
      <h2 id="scanner-result-heading" ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold text-forest focus:outline-none">
        {tr("What this QR contains")}
      </h2>
      <p data-scanner-kind className="mt-1 text-sm font-semibold text-charcoal">{tr(result.kindLabel)}</p>

      {summary.length > 0 && (
        <dl className={`${list} mt-4 rounded-[12px] bg-fog p-4`}>{summary.map((f, i) => row(f, i, true))}</dl>
      )}

      {comparable && (
        <div className="mt-4">
          <label htmlFor={`${expectedId}-input`} className="block text-sm font-semibold leading-6 text-forest">{tr("UPI ID you expect to pay (optional)")}</label>
          <p id={`${expectedId}-help`} className="text-sm leading-6 text-charcoal">{tr("Type the UPI ID you were given. This page then says whether the QR has the same ID.")}</p>
          <input
            id={`${expectedId}-input`}
            data-scanner-expected
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            aria-describedby={`${expectedId}-help`}
            value={expected}
            onChange={(event) => onExpected(event.target.value)}
            placeholder="name@bank"
            className={`${field} font-mono`}
          />
          <div role="status" aria-live="polite" data-scanner-compare className={typed ? "mt-3" : ""}>
            {typed &&
              (result.payeeId === null ? (
                <p className="rounded-[10px] border border-forest/15 bg-fog px-4 py-3 text-sm leading-6 text-forest">
                  <span className="font-semibold">{tr("Note")}:</span> {tr("This code has no UPI ID to compare with the one you typed.")}
                </p>
              ) : result.payeeIds.length > 1 && !result.payeeIds.every((id) => sameUpiId(id, result.payeeIds[0])) ? (
                <p className="rounded-[10px] border-l-4 border-coral bg-white px-4 py-3 text-sm leading-6 text-forest ring-1 ring-forest/10">
                  <span className="font-semibold">{tr("Check")}:</span> {tr("This QR holds more than one UPI ID, so it cannot be compared with the one you typed. Check the payee in your UPI app before you pay.")}
                </p>
              ) : (result.payeeIds.length > 0 ? result.payeeIds : [result.payeeId]).every((id) => sameUpiId(expected, id)) ? (
                <p className="rounded-[10px] border border-forest/15 bg-fog px-4 py-3 text-sm leading-6 text-forest">
                  <span className="font-semibold">{tr("Matches the ID you typed")}.</span> {tr("The UPI ID in the QR is the same as the one you typed. That does not show who owns it.")}
                </p>
              ) : (
                <p className="rounded-[10px] border-l-4 border-coral bg-white px-4 py-3 text-sm leading-6 text-forest ring-1 ring-forest/10">
                  <span className="font-semibold">{tr("Does not match the ID you typed")}.</span> {tr("The UPI ID in the QR is different from the one you typed. Do not pay unless you can explain why.")}
                </p>
              ))}
          </div>
        </div>
      )}

      {result.flags.length > 0 && (
        <ul className="mt-4 space-y-2" data-scanner-flags>
          {[...warns, ...infos].map((flag, index) => (
            <li
              key={`${flag.code}-${index}`}
              data-flag={flag.code}
              className={`rounded-[10px] px-4 py-3 text-sm leading-6 text-forest ${flag.level === "warn" ? "border-l-4 border-coral bg-white ring-1 ring-forest/10" : "bg-fog"}`}
            >
              <span className="font-semibold">{flag.level === "warn" ? tr("Check") : tr("Note")}:</span> {renderFlag(flag, tr)}
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && <dl className={`${list} mt-5`}>{rest.map((f, i) => row(f, i, false))}</dl>}

      <div className="mt-6 border-t border-forest/10 pt-5">
        <h3 className="text-base font-semibold text-forest">{tr("Before you pay")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-forest">
          <li>{tr("Compare the payee name your UPI app shows with the person or shop you mean to pay.")}</li>
          <li>{tr("Check the amount on your app's payment screen before you enter your UPI PIN.")}</li>
          <li>{tr("Receiving money never needs a QR scan or your PIN. If someone asks for either so they can send you money, stop.")}</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-charcoal">
          {tr("This page reads the text inside the QR. It does not show that the UPI ID exists or who owns it. Confirm the payee in your UPI app before you pay.")}
        </p>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-forest">{tr("Show the full text")}</summary>
        <pre dir="ltr" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-[10px] bg-fog p-3 font-mono text-xs leading-5 text-forest">{result.raw}</pre>
      </details>

      <div className="mt-5">
        <button type="button" data-scanner-again className={secondary} onClick={onAgain}>{tr("Scan another")}</button>
      </div>
    </section>
  );
}
