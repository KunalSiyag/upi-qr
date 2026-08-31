import type { SiteLang } from "../lib/locale";

export type HomeCopy = {
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  ctaGenerate: string;
  ctaTemplates: string;
  presetsLabel: string;
  generatorEyebrow: string;
  generatorH2: string;
  generatorIntro: string;
  privacy: string;
  faqHeading: string;
  features: { title: string; copy: string }[];
  useCases: string[];
  faqs: { question: string; answer: string }[];
};

export const HOME_COPY: Record<Exclude<SiteLang, "en" | "hi">, HomeCopy> = {
  ta: {
    title: "இலவச UPI QR ஜெனரேட்டர் | PhonePe, GPay",
    description:
      "கடை அல்லது வங்கிக் கணக்கிற்கு இலவச UPI QR உருவாக்குங்கள். PhonePe, Google Pay, Paytm போஸ்டர்களை பதிவு இல்லாமல் பதிவிறக்குங்கள்.",
    eyebrow: "இலவச UPI QR ஜெனரேட்டர் (தமிழ்)",
    h1: "உங்கள் கடைக்கான இலவச UPI QR குறியீடு",
    intro:
      "தொகையுடன் UPI QR உடனடியாக உருவாக்குங்கள். PhonePe, Google Pay மற்றும் Paytm-க்கு வேலை செய்யும் ஸ்டாண்டி, பதிவு தேவையில்லை.",
    ctaGenerate: "QR இப்போதே உருவாக்கு",
    ctaTemplates: "போஸ்டர் வடிவமைப்புகள்",
    presetsLabel: "விரைவு முன்னமைவுகள்",
    generatorEyebrow: "ஜெனரேட்டர்",
    generatorH2: "30 வினாடிகளில் தொகையுடன் UPI QR",
    generatorIntro: "தரமான upi://pay இணைப்புகளை ஆதரிக்கும் அனைத்து UPI செயலிகளிலும் வேலை செய்யும்.",
    privacy: "தனியுரிமை: உலாவியில் உருவாக்கம். உங்கள் VPA சேவையகத்திற்கு அனுப்பப்படுவதில்லை.",
    faqHeading: "அடிக்கடி கேட்கப்படும் கேள்விகள்",
    features: [
      { title: "உலாவியில் உடனடி உருவாக்கம்", copy: "உள்நுழைவு அல்லது டாஷ்போர்டு இல்லாமல் QR தயாரிக்கவும்." },
      { title: "கட்டணத்திற்கு தயாரான UPI வடிவம்", copy: "பெறுநர் பெயர், UPI ஐடி, தொகை மற்றும் குறிப்பு சேர்க்கவும்." },
      { title: "அச்சுக்கு ஏற்ற போஸ்டர்", copy: "ஸ்டாண்டி, நன்கொடை போஸ்டர் மற்றும் மேசை அட்டைகளாக மாற்றவும்." },
    ],
    useCases: ["கிரானா கடைகள்", "ஃப்ரீலான்சர்கள்", "உணவகங்கள்", "கோயில் நன்கொடை", "கல்விக் கட்டணம்", "நிகழ்ச்சி பதிவு"],
    faqs: [
      {
        question: "UPI QR குறியீட்டை எப்படி உருவாக்குவது?",
        answer: "பெறுநர் பெயர் மற்றும் UPI ஐடியை உள்ளிட்டு உருவாக்கு என அழுத்தவும். உயர் தெளிவுத்திறன் படமாக உடனடியாக பதிவிறக்கலாம்.",
      },
      {
        question: "இது அனைத்து UPI செயலிகளுக்கும் வேலை செய்யுமா?",
        answer: "ஆம். இது தரமான upi://pay QR. PhonePe, Google Pay, Paytm, BHIM மற்றும் வங்கி செயலிகள் ஸ்கேன் செய்யலாம்.",
      },
      {
        question: "தொகையுடன் UPI QR செய்யலாமா?",
        answer: "ஆம். தொகை புலத்தில் நிலையான தொகையை உள்ளிட்டால், ஸ்கேனர் அந்தத் தொகையையே காண்பார். மாறும் பில்களுக்கு காலியாக விடவும்.",
      },
      {
        question: "அதிகாரப்பூர்வ PhonePe அல்லது GPay QR-ஆ?",
        answer: "இல்லை. இது உங்கள் VPA-க்கு இணக்கமான UPI QR. அதிகாரப்பூர்வ வணிகர் QR ஆப் KYC மற்றும் சவுண்ட்பாக்ஸிலிருந்து வரும்.",
      },
    ],
  },
  te: {
    title: "ఉచిత UPI QR జనరేటర్ | PhonePe, GPay",
    description:
      "దుకాణం లేదా బ్యాంక్ ఖాతా కోసం ఉచిత UPI QR సృష్టించండి. PhonePe, Google Pay, Paytm పోస్టర్లు సైన్అప్ లేకుండా డౌన్‌లోడ్ చేయండి.",
    eyebrow: "ఉచిత UPI QR జనరేటర్ (తెలుగు)",
    h1: "మీ షాప్ కోసం ఉచిత UPI QR కోడ్",
    intro:
      "మొత్తంతో UPI QRను తక్షణమే సృష్టించండి. PhonePe, Google Pay మరియు Paytm కోసం స్టాండీ, సైన్అప్ అవసరం లేదు.",
    ctaGenerate: "QR ఇప్పుడే సృష్టించండి",
    ctaTemplates: "పోస్టర్ డిజైన్లు",
    presetsLabel: "త్వరిత ప్రీసెట్లు",
    generatorEyebrow: "జనరేటర్",
    generatorH2: "30 సెకన్లలో మొత్తంతో UPI QR",
    generatorIntro: "ప్రామాణిక upi://pay లింక్‌లను సపోర్ట్ చేసే అన్ని UPI యాప్‌లలో పనిచేస్తుంది.",
    privacy: "గోప్యత: బ్రౌజర్‌లో సృష్టి. మీ VPA సర్వర్‌కు పంపబడదు.",
    faqHeading: "తరచుగా అడిగే ప్రశ్నలు",
    features: [
      { title: "బ్రౌజర్‌లో తక్షణ సృష్టి", copy: "లాగిన్ లేదా డాష్‌బోర్డ్ లేకుండా QR తయారు చేయండి." },
      { title: "చెల్లింపుకు సిద్ధమైన UPI ఫార్మాట్", copy: "స్వీకర్త పేరు, UPI ఐడి, మొత్తం మరియు నోట్ జోడించండి." },
      { title: "ప్రింట్-రెడీ పోస్టర్", copy: "స్టాండీ, దానం పోస్టర్ మరియు టేబుల్ కార్డ్‌లుగా మార్చండి." },
    ],
    useCases: ["కిరాణా దుకాణాలు", "ఫ్రీలాన్సర్లు", "రెస్టారెంట్లు", "దేవాలయ దానం", "ట్యూషన్ ఫీ", "ఈవెంట్ రిజిస్ట్రేషన్"],
    faqs: [
      {
        question: "UPI QR కోడ్‌ని ఎలా తయారు చేయాలి?",
        answer: "స్వీకర్త పేరు మరియు UPI ఐడి నమోదు చేసి Generate నొక్కండి. అధిక రిజల్యూషన్ చిత్రంగా వెంటనే డౌన్‌లోడ్ చేయవచ్చు.",
      },
      {
        question: "ఇది అన్ని UPI యాప్‌లలో పనిచేస్తుందా?",
        answer: "అవును. ఇది ప్రామాణిక upi://pay QR. PhonePe, Google Pay, Paytm, BHIM మరియు బ్యాంక్ యాప్‌లు స్కాన్ చేయవచ్చు.",
      },
      {
        question: "మొత్తంతో UPI QR చేయవచ్చా?",
        answer: "అవును. మొత్తం ఫీల్డ్‌లో ఫిక్స్‌డ్ అమౌంట్ పెడితే స్కానర్ ఆ మొత్తాన్నే చూస్తారు. వేరియబుల్ బిల్లులకు ఖాళీగా ఉంచండి.",
      },
      {
        question: "ఇది అధికారిక PhonePe లేదా GPay QR-నా?",
        answer: "కాదు. ఇది మీ VPAకు అనుకూలమైన UPI QR. అధికారిక మర్చంట్ QR యాప్ KYC మరియు సౌండ్‌బాక్స్ నుంచి వస్తుంది.",
      },
    ],
  },
  mr: {
    title: "मोफत UPI QR जनरेटर | PhonePe, GPay",
    description:
      "दुकान किंवा बँक खात्यासाठी मोफत UPI QR तयार करा. PhonePe, Google Pay, Paytm पोस्टर साइनअपशिवाय डाउनलोड करा.",
    eyebrow: "मोफत UPI QR जनरेटर (मराठी)",
    h1: "तुमच्या दुकानासाठी मोफत UPI QR कोड",
    intro:
      "रकमेसह UPI QR त्वरित तयार करा. PhonePe, Google Pay आणि Paytm साठी स्टँडी, साइनअप नाही.",
    ctaGenerate: "QR आता तयार करा",
    ctaTemplates: "पोस्टर डिझाइन",
    presetsLabel: "क्विक प्रीसेट",
    generatorEyebrow: "जनरेटर",
    generatorH2: "३० सेकंदात रकमेसह UPI QR",
    generatorIntro: "मानक upi://pay लिंक सपोर्ट करणाऱ्या सर्व UPI अॅप्सवर चालतो.",
    privacy: "गोपनीयता: ब्राउझरमध्ये तयार होते. तुमचा VPA सर्व्हरवर जात नाही.",
    faqHeading: "नेहमी विचारले जाणारे प्रश्न",
    features: [
      { title: "ब्राउझरमध्ये त्वरित निर्मिती", copy: "लॉगिन किंवा डॅशबोर्डशिवाय QR तयार करा." },
      { title: "पेमेंट-तयार UPI स्वरूप", copy: "प्राप्तकर्ता नाव, UPI आयडी, रक्कम आणि नोट जोडा." },
      { title: "प्रिंट-रेडी पोस्टर", copy: "स्टँडी, दान पोस्टर आणि टेबल कार्ड बनवा." },
    ],
    useCases: ["किराणा दुकाने", "फ्रीलान्सर", "रेस्टॉरंट", "मंदिर दान", "ट्यूशन फी", "इव्हेंट नोंदणी"],
    faqs: [
      {
        question: "UPI QR कोड कसा तयार करायचा?",
        answer: "प्राप्तकर्त्याचे नाव आणि UPI आयडी टाकून Generate दाबा. उच्च-गुणवत्तेची प्रतिमा लगेच डाउनलोड करा.",
      },
      {
        question: "हा सर्व UPI अॅप्सवर चालेल का?",
        answer: "हो. हा मानक upi://pay QR आहे. PhonePe, Google Pay, Paytm, BHIM आणि बँक अॅप्स स्कॅन करू शकतात.",
      },
      {
        question: "रकमेसह UPI QR करता येईल का?",
        answer: "हो. रक्कम फील्डमध्ये ठराविक रक्कम भरली तर स्कॅनर तीच रक्कम पाहतो. बदलत्या बिलासाठी रिकामे ठेवा.",
      },
      {
        question: "हे अधिकृत PhonePe किंवा GPay QR आहे का?",
        answer: "नाही. हा तुमच्या VPA शी सुसंगत UPI QR आहे. अधिकृत मर्चंट QR अॅप KYC आणि साउंडबॉक्समधून येतो.",
      },
    ],
  },
  es: {
    title: "Generador de Códigos QR Gratis | Pro UPI QR",
    description:
      "Crea códigos QR personalizados para enlaces y pagos gratis sin registro. Descarga plantillas de impresión en alta definición para tu negocio.",
    eyebrow: "Generador de Códigos QR (Español)",
    h1: "Códigos QR y Facturación para tu Negocio",
    intro:
      "Genera códigos QR comerciales, facturas PDF y recibos en segundos. Procesamiento seguro y privado directamente en tu navegador.",
    ctaGenerate: "Crear QR ahora",
    ctaTemplates: "Ver plantillas",
    presetsLabel: "Herramientas rápidas",
    generatorEyebrow: "Generador",
    generatorH2: "Código QR de alta resolución en 30 segundos",
    generatorIntro: "Compatible con todas las cámaras de smartphones y aplicaciones de lectura QR.",
    privacy: "Privacidad: Procesamiento 100% local en tu navegador. Tus datos no se envían a ningún servidor.",
    faqHeading: "Preguntas frecuentes",
    features: [
      { title: "Generación instantánea", copy: "Sin registros ni paneles complicados. Crea y descarga al instante." },
      { title: "Formato universal y nítido", copy: "Códigos QR limpios de alta definición listos para imprimir en cualquier tamaño." },
      { title: "Plantillas de impresión", copy: "Formatos listos para mostradores, mesas y escaparates comerciales." },
    ],
    useCases: ["Tiendas y Comercios", "Autónomos", "Restaurantes y Bares", "Eventos y Entradas", "Consultorías", "Servicios Técnicos"],
    faqs: [
      {
        question: "¿Cómo creo un código QR?",
        answer: "Introduce tu texto o enlace y pulsa Generar. Podrás descargarlo inmediatamente en alta resolución.",
      },
      {
        question: "¿Funciona en cualquier teléfono móvil?",
        answer: "Sí, es un estándar universal compatible con cualquier cámara de smartphone.",
      },
      {
        question: "¿Puedo añadir un importe o texto personalizado?",
        answer: "Sí, puedes personalizar todos los campos de texto e importe según necesites.",
      },
      {
        question: "¿Tiene algún coste o marca de agua?",
        answer: "Es 100% gratuito, sin publicidad ni marcas de agua.",
      },
    ],
  },
  pt: {
    title: "Gerador de QR Code Grátis | Pro UPI QR",
    description:
      "Crie QR Codes personalizados para links e pagamentos sem cadastro. Baixe artes em alta definição prontas para impressão no seu comércio.",
    eyebrow: "Gerador de QR Code (Português)",
    h1: "QR Codes e Cobrança para seu Negócio",
    intro:
      "Gere códigos QR para pagamentos, links e faturas em PDF em segundos. Processamento rápido, gratuito e privado no navegador.",
    ctaGenerate: "Criar QR agora",
    ctaTemplates: "Modelos de impressão",
    presetsLabel: "Atalhos rápidos",
    generatorEyebrow: "Gerador",
    generatorH2: "QR Code em alta definição em 30 segundos",
    generatorIntro: "Compatível com todas as câmeras de celular e aplicativos de leitura de QR Code.",
    privacy: "Privacidade: Processamento 100% local no seu navegador. Nenhum dado é enviado a servidores.",
    faqHeading: "Perguntas frequentes",
    features: [
      { title: "Geração instantânea", copy: "Sem login nem painéis complexos. Crie e baixe na hora." },
      { title: "Formato universal e limpo", copy: "Códigos QR de alta qualidade prontos para impressão em qualquer tamanho." },
      { title: "Artes para balcão", copy: "Formatos prontos para balcões, vitrines e mesas do seu estabelecimento." },
    ],
    useCases: ["Lojas e Varejo", "Autônomos", "Restaurantes e Bares", "Prestadores de Serviço", "Eventos", "Aulas e Consultoria"],
    faqs: [
      {
        question: "Como gerar um QR Code?",
        answer: "Digite seu link ou texto e clique em Gerar para baixar a imagem em alta resolução imediatamente.",
      },
      {
        question: "Funciona em qualquer smartphone?",
        answer: "Sim, padrão universal compatível com câmeras iOS e Android.",
      },
      {
        question: "Posso colocar valores ou mensagens personalizadas?",
        answer: "Sim, todos os campos são totalmente customizáveis.",
      },
      {
        question: "Tem alguma taxa ou marca d'água?",
        answer: "100% gratuito e sem marcas d'água nas suas imagens.",
      },
    ],
  },
  fr: {
    title: "Générateur de QR Code Gratuit | Pro UPI QR",
    description:
      "Créez des QR codes personnalisés pour liens et paiements sans inscription. Téléchargez des visuels haute définition pour votre commerce.",
    eyebrow: "Générateur de QR Code (Français)",
    h1: "QR Codes et Facturation pour Entreprises",
    intro:
      "Créez des QR codes professionnels, factures PDF et devis en quelques secondes. Traitement sécurisé et privé dans votre navigateur.",
    ctaGenerate: "Générer un QR code",
    ctaTemplates: "Modèles d'affiches",
    presetsLabel: "Outils rapides",
    generatorEyebrow: "Générateur",
    generatorH2: "Votre QR code haute résolution en 30 secondes",
    generatorIntro: "Compatible avec tous les smartphones et applications de lecture de QR codes.",
    privacy: "Confidentialité : Traitement 100% local dans votre navigateur. Aucune donnée stockée.",
    faqHeading: "Questions fréquentes",
    features: [
      { title: "Création instantanée", copy: "Sans inscription ni tableau de bord complexe. Téléchargement immédiat." },
      { title: "Qualité d'impression nette", copy: "QR codes vectoriels et haute définition prêts pour l'affichage physique." },
      { title: "Supports de comptoir", copy: "Mises en page prêtes à imprimer pour comptoirs, vitrines et tables." },
    ],
    useCases: ["Commerces de proximité", "Indépendants", "Restaurants et Cafés", "Artisans", "Événements", "Professions libérales"],
    faqs: [
      {
        question: "Comment créer un QR code ?",
        answer: "Entrez votre lien ou texte et cliquez sur Générer pour télécharger l'image en haute résolution.",
      },
      {
        question: "Est-ce compatible avec tous les smartphones ?",
        answer: "Oui, tous les appareils photo modernes scannent le code instantanément.",
      },
      {
        question: "Peut-on personnaliser le montant ou le texte ?",
        answer: "Oui, vous pouvez renseigner des montants et libellés personnalisés.",
      },
      {
        question: "Le service est-il vraiment gratuit ?",
        answer: "100% gratuit et garanti sans filigrane.",
      },
    ],
  },
  de: {
    title: "Kostenloser QR-Code Generator | Pro UPI QR",
    description:
      "Erstellen Sie individuelle QR-Codes für Links und Zahlungen ohne Registrierung. Druckvorlagen in hoher Auflösung für Ihr Gewerbe.",
    eyebrow: "QR-Code Generator (Deutsch)",
    h1: "QR-Codes und Abrechnung für Ihr Gewerbe",
    intro:
      "Erstellen Sie professionelle QR-Codes, PDF-Rechnungen und Angebote in Sekundenschnelle. Sicher und lokal in Ihrem Browser.",
    ctaGenerate: "QR-Code jetzt erstellen",
    ctaTemplates: "Druckvorlagen ansehen",
    presetsLabel: "Schnellzugriff",
    generatorEyebrow: "Generator",
    generatorH2: "Hochauflösender QR-Code in 30 Sekunden",
    generatorIntro: "Kompatibel mit allen Smartphone-Kameras und Standard-QR-Readern.",
    privacy: "Datenschutz: 100% lokale Verarbeitung im Browser. Keine Speicherung auf externen Servern.",
    faqHeading: "Häufig gestellte Fragen",
    features: [
      { title: "Sofortige Generierung", copy: "Ohne Registrierung und ohne Login sofort erstellen und herunterladen." },
      { title: "Druckreife Qualität", copy: "Gestochen scharfe QR-Grafiken für Poster, Flyer und Aufsteller." },
      { title: "Vorlagen für Theken", copy: "Druckfertige Layouts für Verkaufstresen, Schaufenster und Tische." },
    ],
    useCases: ["Einzelhandel & Läden", "Freiberufler & Agenturen", "Gastronomie & Cafés", "Handwerker", "Vereine & Events", "Dienstleister"],
    faqs: [
      {
        question: "Wie erstelle ich einen QR-Code?",
        answer: "Zieladresse oder Text eingeben, auf Erstellen klicken und hochauflösendes PNG herunterladen.",
      },
      {
        question: "Funktioniert der Code auf allen Smartphones?",
        answer: "Ja, alle gängigen Kamera-Apps können den QR-Code sofort scannen.",
      },
      {
        question: "Können Beträge voreingestellt werden?",
        answer: "Ja, Sie können feste Beträge oder Beschreibungen flexibel hinzufügen.",
      },
      {
        question: "Gibt es Wasserzeichen?",
        answer: "Nein, alle Grafiken sind werbefrei und ohne Wasserzeichen.",
      },
    ],
  },
  id: {
    title: "Generator QR Code Gratis | Pro UPI QR",
    description:
      "Buat kode QR kustom untuk tautan dan pembayaran tanpa daftar akun. Unduh gambar resolusi tinggi siap cetak untuk toko dan usaha Anda.",
    eyebrow: "Generator QR Code (Bahasa Indonesia)",
    h1: "Solusi QR Code & Faktur untuk Usaha Anda",
    intro:
      "Buat kode QR toko, faktur invoice PDF, dan kuitansi dalam hitungan detik. Cepat, 100% gratis, dan aman langsung di browser Anda.",
    ctaGenerate: "Buat QR Sekarang",
    ctaTemplates: "Lihat Templat Cetak",
    presetsLabel: "Pilihan Cepat",
    generatorEyebrow: "Generator",
    generatorH2: "QR Code Resolusi Tinggi dalam 30 Detik",
    generatorIntro: "Dapat dipindai oleh semua tipe kamera ponsel pintar dan aplikasi pemindai QR.",
    privacy: "Privasi Terjamin: Pemrosesan 100% lokal di browser Anda. Data tidak dikirim ke server luar.",
    faqHeading: "Pertanyaan Umum",
    features: [
      { title: "Pembuatan Instan", copy: "Tanpa perlu login atau dashboard yang rumit. Buat dan unduh langsung." },
      { title: "Kualitas Siap Cetak", copy: "Gambar QR tajam dan jelas, cocok dicetak dalam berbagai ukuran stiker." },
      { title: "Templat Meja Kasir", copy: "Tata letak siap cetak untuk meja kasir, etalase, dan meja makan." },
    ],
    useCases: ["Toko Kelontong & Ritel", "Pekerja Lepas (Freelancer)", "Restoran & Kafe", "Jasa & Servis", "Acara & Tiket", "Lembaga Donasi"],
    faqs: [
      {
        question: "Bagaimana cara membuat QR Code?",
        answer: "Ketik tautan atau teks Anda, klik Buat, dan unduh gambar beresolusi tinggi seketika.",
      },
      {
        question: "Apakah bisa dipindai semua jenis HP?",
        answer: "Bisa, kompatibel dengan seluruh aplikasi kamera HP Android maupun iPhone." },
      {
        question: "Bisakah memasukkan nominal uang?",
        answer: "Bisa, Anda dapat mencantumkan nominal pembayaran dan catatan transaksi.",
      },
      {
        question: "Apakah ada watermark?",
        answer: "100% bersih tanpa watermark dan gratis selamanya.",
      },
    ],
  },
};
