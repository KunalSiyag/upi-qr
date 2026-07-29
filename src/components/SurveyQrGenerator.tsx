import React, { useState, useRef } from "react";
import QRCode from "qrcode";

interface Question {
  id: string;
  text: string;
  type: "rating" | "text" | "choice";
  options?: string[];
}

export function SurveyQrGenerator() {
  const [businessName, setBusinessName] = useState("The Grand Cafe & Bistro");
  const [surveyTitle, setSurveyTitle] = useState("How was your dining experience today?");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("https://g.page/r/your-google-review-link/review");
  const [surveyType, setSurveyType] = useState<"stars" | "emojis">("stars");
  const [questions, setQuestions] = useState<Question[]>([
    { id: "1", text: "How would you rate the food quality?", type: "rating" },
    { id: "2", text: "How was the service speed & friendliness?", type: "rating" },
    { id: "3", text: "Any suggestions or feedback for our team?", type: "text" },
  ]);

  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Construct survey config data string / payload URL
  const surveyId = Math.random().toString(36).substring(2, 8);
  const surveyUrl = `${typeof window !== "undefined" ? window.location.origin : "https://www.proupiqr.in"}/r/?id=survey_${surveyId}&url=${encodeURIComponent(googleReviewUrl || "https://www.proupiqr.in/")}`;

  // Generate QR code preview
  React.useEffect(() => {
    QRCode.toDataURL(surveyUrl, {
      width: 320,
      margin: 2,
      color: { dark: "#113b2c", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [surveyUrl]);

  const addQuestion = () => {
    const newQ: Question = {
      id: Math.random().toString(),
      text: "New feedback question",
      type: "rating",
    };
    setQuestions([...questions, newQ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, text: string) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, text } : q)));
  };

  const copySurveyLink = () => {
    navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Top Controls & Navigation */}
      <div className="flex items-center justify-between border-b border-forest/10 pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("builder")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === "builder"
                ? "bg-forest text-white shadow-md"
                : "bg-cream text-forest/70 hover:bg-mint"
            }`}
          >
            🛠️ Survey Builder
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === "preview"
                ? "bg-forest text-white shadow-md"
                : "bg-cream text-forest/70 hover:bg-mint"
            }`}
          >
            📱 Mobile Customer Preview
          </button>
        </div>

        <span className="text-xs font-mono font-bold text-leaf bg-mint px-3 py-1.5 rounded-full border border-leaf/20 hidden sm:inline-block">
          ⭐ Google Review Redirect Enabled
        </span>
      </div>

      {activeTab === "builder" ? (
        <div className="grid md:grid-cols-12 gap-8">
          {/* Builder Form (Left Column) */}
          <div className="md:col-span-7 space-y-6">
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-black text-forest border-b border-forest/10 pb-3 flex items-center gap-2">
                <span className="text-leaf">📋</span> Business & Survey Setup
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-black uppercase text-forest/70 mb-1">
                    Business / Store Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Sharma Cafe, Apex Dental Clinic"
                    className="w-full px-4 py-2.5 rounded-xl border border-forest/20 text-xs font-bold text-forest outline-none focus:border-leaf"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-forest/70 mb-1">
                    Main Survey Title / Heading
                  </label>
                  <input
                    type="text"
                    value={surveyTitle}
                    onChange={(e) => setSurveyTitle(e.target.value)}
                    placeholder="e.g. How was your experience today?"
                    className="w-full px-4 py-2.5 rounded-xl border border-forest/20 text-xs font-bold text-forest outline-none focus:border-leaf"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-forest/70 mb-1">
                    Google Business Review Link (Optional)
                  </label>
                  <input
                    type="url"
                    value={googleReviewUrl}
                    onChange={(e) => setGoogleReviewUrl(e.target.value)}
                    placeholder="https://g.page/r/your-google-review-link"
                    className="w-full px-4 py-2.5 rounded-xl border border-forest/20 text-xs font-mono text-forest outline-none focus:border-leaf"
                  />
                  <p className="text-[11px] text-forest/60 mt-1">
                    💡 Customers giving 5-star ratings will automatically be prompted to leave a review on Google!
                  </p>
                </div>
              </div>
            </div>

            {/* Questions Config */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-forest/10 pb-3">
                <h3 className="text-base font-black text-forest">Survey Questions ({questions.length})</h3>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="px-3 py-1.5 rounded-xl bg-mint border border-leaf/20 text-xs font-bold text-forest hover:bg-leaf hover:text-white transition-all"
                >
                  + Add Question
                </button>
              </div>

              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="p-3.5 rounded-2xl bg-cream border border-forest/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-forest">Q{idx + 1}</span>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(q.id)}
                          className="text-xs font-bold text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={q.text}
                      onChange={(e) => updateQuestion(q.id, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-forest/20 text-xs font-semibold text-forest bg-white outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* QR Code & Standee Output (Right Column) */}
          <div className="md:col-span-5 space-y-6">
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-md text-center space-y-5 sticky top-6">
              <h3 className="text-lg font-black text-forest">Feedback Standee QR Code</h3>

              {qrDataUrl && (
                <div className="mx-auto w-52 h-52 border border-forest/15 p-4 rounded-3xl bg-white shadow-md flex items-center justify-center">
                  <img src={qrDataUrl} alt="Survey QR Code" className="w-full h-full object-contain" />
                </div>
              )}

              <div className="rounded-2xl bg-mint/40 p-4 border border-leaf/20 text-left space-y-2">
                <p className="text-xs font-black text-forest">⭐ Features Included:</p>
                <ul className="text-[11px] text-forest/80 space-y-1">
                  <li>✓ Mobile responsive feedback form</li>
                  <li>✓ 1-click Google Review boost</li>
                  <li>✓ Unlimited customer responses</li>
                  <li>✓ Print-ready counter standee QR</li>
                </ul>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={copySurveyLink}
                  className="w-full py-3 rounded-2xl bg-forest text-white text-xs font-black hover:bg-leaf transition-all shadow-md"
                >
                  {copied ? "✓ Survey Link Copied!" : "📋 Copy Survey URL"}
                </button>

                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download="feedback-survey-qr.png"
                    className="block w-full py-2.5 rounded-xl bg-mint border border-leaf/20 text-forest text-xs font-bold hover:bg-leaf hover:text-white transition-all"
                  >
                    🖼️ Download PNG QR
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Mobile Customer Preview Tab */
        <div className="max-w-md mx-auto rounded-[2.5rem] border-4 border-slate-900 bg-slate-900 p-3 shadow-2xl">
          <div className="rounded-[2rem] bg-white p-6 space-y-6 min-h-[500px]">
            {/* Store Header */}
            <div className="text-center border-b border-forest/10 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-mint border border-leaf/20 mx-auto flex items-center justify-center text-leaf font-black text-xl mb-2">
                🏬
              </div>
              <h2 className="text-lg font-black text-forest">{businessName}</h2>
              <p className="text-xs text-forest/70 mt-1">{surveyTitle}</p>
            </div>

            {/* Rating Stars Preview */}
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id} className="bg-cream p-4 rounded-2xl border border-forest/10 space-y-2">
                  <p className="text-xs font-bold text-forest">{q.text}</p>
                  <div className="flex gap-2 text-2xl cursor-pointer">
                    {"⭐⭐⭐⭐⭐".split("").map((star, i) => (
                      <span key={i} className="hover:scale-125 transition-transform">
                        {star}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Google Review Prompt Banner */}
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-2">
              <span className="text-xs font-black text-emerald-900">Loved our service?</span>
              <p className="text-[11px] text-emerald-700">Tap below to share your 5-star review directly on Google Maps!</p>
              <a
                href={
                  googleReviewUrl && (googleReviewUrl.startsWith("http://") || googleReviewUrl.startsWith("https://"))
                    ? googleReviewUrl
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block py-2 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-sm"
              >
                Review Us on Google &rarr;
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
