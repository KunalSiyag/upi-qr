import type { SiteLang } from "../lib/locale";
import { SPONSOR_TIERS } from "./sponsors";

/** Homepage sponsor labels (en/hi/ta/te/mr; other languages show no sponsor placements). */
export const SPONSOR_COPY: Partial<Record<SiteLang, {
  sponsored: string;
  house: string;
  title: string;
  body: string;
  cta: string;
  supported: string;
  advertise: string;
  yourLogo: string;
  tilePrice: string;
}>> = {
  en: {
    sponsored: "Sponsored",
    house: "Advertise here",
    title: "Reach shop owners and freelancers",
    body: "Put your brand beside India's free UPI QR generator. One featured sponsor at a time, clearly labelled.",
    cta: "Sponsor this spot",
    supported: "Supported by",
    advertise: "Advertise",
    yourLogo: "Your logo here",
    tilePrice: `${SPONSOR_TIERS.tile.label}/month`,
  },
  hi: {
    sponsored: "प्रायोजित",
    house: "यहाँ विज्ञापन दें",
    title: "दुकानदारों और फ्रीलांसरों तक पहुँचें",
    body: "भारत के मुफ़्त UPI QR जनरेटर के साथ अपना ब्रांड दिखाएँ। एक समय में एक ही फ़ीचर्ड स्पॉन्सर, साफ़ लेबल के साथ।",
    cta: "इस जगह को स्पॉन्सर करें",
    supported: "इनके सहयोग से",
    advertise: "विज्ञापन दें",
    yourLogo: "आपका लोगो यहाँ",
    tilePrice: `${SPONSOR_TIERS.tile.label}/माह`,
  },
  ta: {
    sponsored: "ஸ்பான்சர்",
    house: "இங்கே விளம்பரம் செய்யுங்கள்",
    title: "கடை உரிமையாளர்கள், ஃப்ரீலான்சர்களைச் சென்றடையுங்கள்",
    body: "இந்தியாவின் இலவச UPI QR ஜெனரேட்டர் அருகில் உங்கள் பிராண்ட். ஒரே நேரத்தில் ஒரு ஃபீச்சர்டு ஸ்பான்சர் மட்டும், தெளிவான லேபிளுடன்.",
    cta: "இந்த இடத்தை ஸ்பான்சர் செய்யுங்கள்",
    supported: "ஆதரவாளர்கள்",
    advertise: "விளம்பரம் செய்ய",
    yourLogo: "உங்கள் லோகோ இங்கே",
    tilePrice: `${SPONSOR_TIERS.tile.label}/மாதம்`,
  },
  te: {
    sponsored: "స్పాన్సర్డ్",
    house: "ఇక్కడ ప్రకటన ఇవ్వండి",
    title: "దుకాణదారులు, ఫ్రీలాన్సర్లను చేరుకోండి",
    body: "భారతదేశపు ఉచిత UPI QR జనరేటర్ పక్కన మీ బ్రాండ్. ఒకసారి ఒకే ఫీచర్డ్ స్పాన్సర్, స్పష్టమైన లేబుల్‌తో.",
    cta: "ఈ స్థానాన్ని స్పాన్సర్ చేయండి",
    supported: "మద్దతుదారులు",
    advertise: "ప్రకటన ఇవ్వండి",
    yourLogo: "మీ లోగో ఇక్కడ",
    tilePrice: `${SPONSOR_TIERS.tile.label}/నెల`,
  },
  mr: {
    sponsored: "प्रायोजित",
    house: "इथे जाहिरात करा",
    title: "दुकानदार आणि फ्रीलान्सरपर्यंत पोहोचा",
    body: "भारताच्या मोफत UPI QR जनरेटरशेजारी तुमचा ब्रँड. एका वेळी एकच फीचर्ड स्पॉन्सर, स्पष्ट लेबलसह.",
    cta: "ही जागा स्पॉन्सर करा",
    supported: "यांच्या सहकार्याने",
    advertise: "जाहिरात करा",
    yourLogo: "तुमचा लोगो इथे",
    tilePrice: `${SPONSOR_TIERS.tile.label}/महिना`,
  },
};
