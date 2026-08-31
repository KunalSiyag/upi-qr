import type { LocalizedToolCopy } from "./localizedTools";

export type InternationalLang = "es" | "pt" | "fr" | "de" | "id";

export const INTERNATIONAL_TOOL_COPY: Record<string, Record<InternationalLang, LocalizedToolCopy>> = {
  "digital-visiting-card": {
    es: {
      name: "Tarjeta de Visita Digital",
      title: "Tarjeta de Visita Digital y QR Gratis | Sin Registro",
      description: "Crea tu tarjeta de visita digital interactiva con enlaces, teléfono, WhatsApp y código QR de pago gratis en tu navegador sin registro.",
      intro: "Reúne tus datos de contacto, enlaces a redes sociales y código QR de cobro en una sola tarjeta virtual para compartir por WhatsApp o NFC.",
      steps: ["Introduce tu nombre, cargo y teléfono", "Añade tu enlace o cuenta de cobro", "Descarga la tarjeta en PNG o comparte el enlace"],
      faqs: [
        { question: "¿Necesito instalar una aplicación?", answer: "No. La tarjeta se crea de forma instantánea en tu navegador y tus clientes la abren con cualquier cámara o navegador web." },
        { question: "¿Puedo incluir un importe fijo?", answer: "Sí, puedes fijar un importe de consulta o dejarlo libre para que el cliente pague según el servicio." }
      ]
    },
    pt: {
      name: "Cartão de Visita Digital",
      title: "Cartão de Visita Digital Grátis com QR Code | Sem Cadastro",
      description: "Crie seu cartão de visita digital interativo com WhatsApp, telefone, links e QR Code para pagamentos. Grátis e privado no navegador.",
      intro: "Reúna contatos, redes sociais e QR Code para recebimento de pagamentos em um único cartão virtual para compartilhar via WhatsApp ou NFC.",
      steps: ["Insira seu nome, profissão e WhatsApp", "Adicione a sua chave ou link de pagamento", "Baixe a imagem em PNG ou compartilhe o link"],
      faqs: [
        { question: "É necessário instalar algum aplicativo?", answer: "Não. O cartão é gerado diretamente no seu navegador e qualquer cliente pode escanear com a câmera do celular." },
        { question: "Posso definir um valor fixo no QR Code?", answer: "Sim, você pode definir um valor padrão de cobrança ou deixar em branco para pagamentos variáveis." }
      ]
    },
    fr: {
      name: "Carte de Visite Digitale",
      title: "Carte de Visite Digitale Gratuite avec QR Code",
      description: "Créez votre carte de visite numérique interactive avec liens, WhatsApp et QR code de paiement gratuit. Sans inscription ni serveur.",
      intro: "Centralisez vos coordonnées, réseaux sociaux et QR code de paiement sur une seule carte virtuelle prête à être partagée par message ou NFC.",
      steps: ["Renseignez votre nom, activité et téléphone", "Ajoutez votre lien ou identifiant de paiement", "Téléchargez la carte en PNG ou partagez le lien"],
      faqs: [
        { question: "Faut-il installer une application ?", answer: "Non. La carte se crée directement dans votre navigateur et s'ouvre facilement avec n'importe quel smartphone." },
        { question: "Puis-je définir un montant fixe ?", answer: "Oui, vous pouvez fixer un tarif de prestation ou laisser le champ libre pour tout montant." }
      ]
    },
    de: {
      name: "Digitale Visitenkarte",
      title: "Digitale Visitenkarte Kostenlos mit QR-Code Erstellen",
      description: "Erstellen Sie eine interaktive digitale Visitenkarte mit WhatsApp, Telefon, Links und QR-Code. 100% kostenlos und lokal im Browser.",
      intro: "Bündeln Sie Ihre Kontaktdaten, Social-Links und QR-Code auf einer digitalen Karte zum Teilen via Messenger oder NFC.",
      steps: ["Name, Beruf und Telefonnummer eingeben", "Zahlungs-Link oder Bankverbindung hinterlegen", "Visitenkarte als PNG herunterladen oder teilen"],
      faqs: [
        { question: "Wird eine spezielle App benötigt?", answer: "Nein. Die Karte wird direkt im Webbrowser generiert und kann mit jeder Smartphone-Kamera gescannt werden." },
        { question: "Kann ein fester Betrag voreingestellt werden?", answer: "Ja, Sie können einen festen Betrag für Beratungen eintragen oder das Feld für variable Beträge freilassen." }
      ]
    },
    id: {
      name: "Kartu Nama Digital",
      title: "Kartu Nama Digital Gratis dengan QR Code | Tanpa Daftar",
      description: "Buat kartu nama digital interaktif dengan tautan media sosial, WhatsApp, dan QR Code pembayaran. 100% gratis dan aman di browser.",
      intro: "Satukan informasi kontak, tautan media sosial, dan QR Code pembayaran dalam satu kartu virtual untuk dibagikan lewat WhatsApp atau NFC.",
      steps: ["Masukkan nama, usaha, dan nomor WhatsApp", "Tambahkan tautan atau QR pembayaran", "Unduh kartu dalam format PNG atau bagikan tautan"],
      faqs: [
        { question: "Apakah memerlukan aplikasi tambahan?", answer: "Tidak. Kartu dibuat langsung di browser dan dapat dibuka oleh siapa saja menggunakan kamera ponsel biasa." },
        { question: "Bisakah memasukkan nominal pembayaran tetap?", answer: "Bisa. Anda bisa menentukan tarif tetap atau membiarkannya kosong untuk nominal fleksibel." }
      ]
    }
  },
  "dynamic-qr-generator": {
    es: {
      name: "Generador de QR Dinámico",
      title: "Generador de Códigos QR Dinámicos Gratis",
      description: "Crea códigos QR dinámicos gratis para redirigir a menús, páginas web y pagos. Cambia el enlace de destino sin reimprimir el código.",
      intro: "A diferencia de un QR estático, un código QR dinámico te permite actualizar el enlace de destino en cualquier momento sin cambiar el cartel impreso.",
      steps: ["Introduce la URL de destino inicial", "Personaliza y descarga tu código QR", "Modifica el enlace cuando lo necesites"],
      faqs: [
        { question: "¿Cuál es la diferencia entre un QR estático y uno dinámico?", answer: "El QR estático guarda los datos fijos; el dinámico redirige mediante una URL que puedes actualizar sin reimprimir." },
        { question: "¿Es ideal para cartas de restaurantes?", answer: "Sí, es perfecto para menús y ofertas que cambian periódicamente." }
      ]
    },
    pt: {
      name: "Gerador de QR Dinâmico",
      title: "Gerador de QR Code Dinâmico Grátis | Altere o Link",
      description: "Gere QR Codes dinâmicos grátis para negócios e pagamentos. Atualize o link de destino a qualquer momento sem trocar o material impresso.",
      intro: "O QR Code dinâmico permite atualizar a página ou cardápio de destino a qualquer momento sem a necessidade de reimprimir seus cartazes.",
      steps: ["Insira o link de destino inicial", "Gere e baixe o seu QR Code", "Atualize o endereço de destino quando quiser"],
      faqs: [
        { question: "Qual a vantagem do QR dinâmico?", answer: "Você não precisa imprimir novos materiais sempre que mudar seu link, cardápio ou chave de pagamento." },
        { question: "Funciona em qualquer celular?", answer: "Sim, qualquer smartphone com câmera lê o código QR instantaneamente." }
      ]
    },
    fr: {
      name: "Générateur QR Dynamique",
      title: "Générateur de QR Code Dynamique Gratuit",
      description: "Créez des QR codes dynamiques gratuits pour rediriger vers vos menus, sites et paiements. Modifiez le lien sans réimprimer le code.",
      intro: "Un QR code dynamique enregistre une URL courte réorientable, vous permettant de changer la page cible sans réimprimer vos supports physiques.",
      steps: ["Saisissez le lien de destination initial", "Générez et téléchargez votre QR code", "Mettez à jour le lien de redirection à tout moment"],
      faqs: [
        { question: "Pourquoi choisir un QR dynamique ?", answer: "Il vous évite de réimprimer vos affiches lorsque votre carte, site ou offre promotionnelle change." },
        { question: "Est-ce compatible avec tous les smartphones ?", answer: "Oui, la redirection s'effectue via n'importe quel lecteur de QR code standard." }
      ]
    },
    de: {
      name: "Dynamischer QR-Generator",
      title: "Dynamischer QR-Code Generator Kostenlos | Link Ändern",
      description: "Erstellen Sie kostenlose dynamische QR-Codes für Websites, Menüs und Zahlungen. Ziel-Link jederzeit flexibel anpassen ohne Neudruck.",
      intro: "Dynamische QR-Codes leiten auf eine kurze Weiterleitungs-URL weiter, sodass Sie das Link-Ziel jederzeit ändern können, ohne Aufsteller neu zu drucken.",
      steps: ["Ziel-URL eingeben", "QR-Code erstellen und herunterladen", "Zieladresse bei Bedarf flexibel aktualisieren"],
      faqs: [
        { question: "Was ist der Vorteil dynamischer QR-Codes?", answer: "Sie sparen Druckkosten, da Sie das Ziel von Speisekarten oder Webseiten nachträglich anpassen können." },
        { question: "Benötigen Kunden eine besondere App?", answer: "Nein, handelsübliche Kamera-Apps öffnen den Link sofort." }
      ]
    },
    id: {
      name: "Generator QR Dinamis",
      title: "Generator QR Code Dinamis Gratis | Ubah Link Fleksibel",
      description: "Buat QR Code dinamis gratis untuk menu, web, dan pembayaran. Ubah tautan tujuan kapan saja tanpa perlu mencetak ulang kode QR.",
      intro: "Kode QR dinamis memungkinkan Anda memperbarui alamat web atau menu tujuan kapan pun tanpa harus mencetak ulang brosur atau stiker toko.",
      steps: ["Masukkan tautan tujuan awal", "Buat dan unduh QR Code Anda", "Perbarui tautan tujuan saat diperlukan"],
      faqs: [
        { question: "Apa keunggulan QR dinamis dibanding statis?", answer: "QR dinamis memungkinkan pengubahan link tujuan tanpa mengganti cetakan fisik yang sudah dipasang." },
        { question: "Apakah bisa dipindai semua HP?", answer: "Bisa, semua kamera ponsel pintar dapat memindai kode QR secara langsung." }
      ]
    }
  },
  "qr-sticker-generator": {
    es: {
      name: "Generador de Pegatinas QR",
      title: "Generador de Pegatinas QR A4 para Imprimir Gratis",
      description: "Diseña e imprime hojas de pegatinas y etiquetas de códigos QR en tamaño A4 para mostradores, mesas y productos sin marcas de agua.",
      intro: "Crea hojas completas de pegatinas de códigos QR en tamaño A4 listas para imprimir y pegar en escaparates, mostradores o mesas.",
      steps: ["Selecciona el tamaño y cuadrícula de pegatinas", "Introduce tu código o información", "Descarga el documento A4 listo para imprimir"],
      faqs: [
        { question: "¿Qué papel es recomendable para imprimir?", answer: "Recomendamos hojas autoadhesivas tamaño A4 para despegar y colocar fácilmente." },
        { question: "¿Se puede incluir el logo del comercio?", answer: "Sí, puedes personalizar el texto y diseño antes de generar el PDF." }
      ]
    },
    pt: {
      name: "Gerador de Adesivos QR",
      title: "Gerador de Adesivos QR Code A4 para Imprimir Grátis",
      description: "Gere folhas de adesivos e etiquetas de QR Code em folha A4 prontas para impressão em balcões e produtos. 100% grátis e sem cadastro.",
      intro: "Gere folhas completas de etiquetas e adesivos com seu QR Code em formato A4, prontas para colar em mesas, balcões e embalagens.",
      steps: ["Escolha o layout e quantidade de adesivos", "Insira os dados do seu QR Code", "Baixe a folha A4 pronta para impressão"],
      faqs: [
        { question: "Qual papel utilizar na impressão?", answer: "Papel adesivo fosco ou brilhante tamanho A4 para facilitar a aplicação." },
        { question: "As etiquetas possuem boa resolução?", answer: "Sim, os códigos são gerados em alta definição para leitura rápida e precisa." }
      ]
    },
    fr: {
      name: "Générateur d'Autocollants QR",
      title: "Générateur d'Autocollants QR Code A4 à Imprimer",
      description: "Créez et imprimez des planches d'autocollants et étiquettes QR code au format A4 pour vos tables et comptoirs. Gratuit et instantané.",
      intro: "Générez des planches d'étiquettes et autocollants QR code au format A4 prêtes pour l'impression directe et la pose sur vos comptoirs.",
      steps: ["Choisissez le format de grille souhaité", "Renseignez les données de votre QR code", "Téléchargez la planche A4 prête à imprimer"],
      faqs: [
        { question: "Quel type de papier choisir ?", answer: "Nous recommandons des feuilles de papier autocollant A4 standard." },
        { question: "Les QR codes sont-ils nets à l'impression ?", answer: "Oui, la résolution vectorielle garantit une netteté parfaite à l'impression." }
      ]
    },
    de: {
      name: "QR-Sticker Generator",
      title: "QR-Code Sticker und Aufkleber A4 Druckvorlage",
      description: "Erstellen Sie A4-Druckbögen für QR-Code Aufkleber und Tischaufsteller für Ihr Geschäft. Kostenlos, werbefrei und direkt druckbar.",
      intro: "Erstellen Sie druckfertige A4-Bögen mit mehreren QR-Code Aufklebern für Ladentische, Schaufenster und Verpackungen.",
      steps: ["Aufkleber-Raster und Größe auswählen", "QR-Code Inhalt eingeben", "Druckfertige A4-Vorlage herunterladen"],
      faqs: [
        { question: "Welches Papier eignet sich am besten?", answer: "Handelsübliche A4-Etikettenbögen oder selbstklebendes Fotopapier." },
        { question: "Sind die QR-Codes gut lesbar?", answer: "Ja, die Codes werden mit hohem Kontrast und optimaler Fehlerkorrektur erzeugt." }
      ]
    },
    id: {
      name: "Generator Stiker QR",
      title: "Generator Stiker QR Code Lembar A4 Siap Cetak",
      description: "Cetak lembar stiker dan label QR Code ukuran A4 untuk meja kasir, etalase, dan produk toko Anda. 100% gratis tanpa watermark.",
      intro: "Buat lembaran stiker QR Code siap cetak di kertas A4 untuk ditempel pada meja kasir, etalase, kemasan produk, atau tenda meja.",
      steps: ["Pilih format susunan stiker A4", "Masukkan data QR Code Anda", "Unduh file siap cetak dalam hitungan detik"],
      faqs: [
        { question: "Kertas apa yang disarankan untuk mencetak?", answer: "Gunakan kertas stiker A4 atau kertas foto glossy agar awet dan mudah ditempel." },
        { question: "Apakah hasil cetak jelas?", answer: "Ya, kode QR digenerate dalam resolusi tajam agar mudah dipindai oleh semua tipe kamera HP." }
      ]
    }
  },
  "gst-calculator": {
    es: {
      name: "Calculadora de IVA e Impuestos",
      title: "Calculadora de IVA e Impuestos Comerciales Gratis",
      description: "Calcula el precio neto, bruto y el desglose de IVA o impuestos sobre ventas al instante. Herramienta precisa y gratuita para negocios.",
      intro: "Obtén el desglose exacto de base imponible, tipo de IVA o impuesto aplicable y precio total con un solo clic.",
      steps: ["Introduce la cantidad base o total", "Selecciona el porcentaje de impuesto", "Visualiza el desglose exacto al instante"],
      faqs: [
        { question: "¿Permite calcular precios con IVA incluido y sin IVA?", answer: "Sí, puedes calcular tanto hacia adelante (añadir IVA) como hacia atrás (desglosar IVA)." },
        { question: "¿Es adecuada para facturación?", answer: "Sí, proporciona cálculos exactos para facturas y presupuestos." }
      ]
    },
    pt: {
      name: "Calculadora de Impostos e IVA",
      title: "Calculadora de Impostos e IVA Comercial Grátis",
      description: "Calcule valores brutos, líquidos e alíquotas de impostos comerciais com precisão instantânea. Gratuito e sem necessidade de cadastro.",
      intro: "Calcule com exatidão a base de cálculo, alíquotas de impostos e o valor final de produtos e serviços para a sua empresa.",
      steps: ["Informe o valor base ou valor total", "Defina a alíquota de imposto desejada", "Confira o detalhamento dos valores imediatamente"],
      faqs: [
        { question: "Posso calcular valores líquidos e brutos?", answer: "Sim, a ferramenta calcula tanto o acréscimo quanto a extração de tributos." },
        { question: "Os cálculos são precisos para faturas?", answer: "Sim, os cálculos utilizam arredondamento monetário preciso para documentos fiscais." }
      ]
    },
    fr: {
      name: "Calculateur de TVA et Taxes",
      title: "Calculateur de TVA et Taxes Professionnelles Gratuit",
      description: "Calculez les montants HT, TTC et la TVA applicable instantanément pour vos factures et devis. Outil professionnel gratuit et rapide.",
      intro: "Calculez facilement le montant hors taxe (HT), la taxe sur la valeur ajoutée (TVA) et le montant toutes taxes comprises (TTC).",
      steps: ["Saisissez le montant HT ou TTC", "Sélectionnez le taux de TVA applicable", "Obtenez la ventilation complète immédiatement"],
      faqs: [
        { question: "Peut-on calculer du HT vers TTC et inversement ?", answer: "Oui, le calcul s'effectue dans les deux sens de manière instantanée." },
        { question: "Les arrondis sont-ils conformes ?", answer: "Oui, les règles d'arrondi au centime près sont respectées pour la facturation." }
      ]
    },
    de: {
      name: "MwSt & Steuerrechner",
      title: "MwSt-Rechner & Umsatzsteuerrechner Kostenlos",
      description: "Berechnen Sie Netto, Brutto und die Mehrwertsteuer für Rechnungen und Angebote exakt und sekundenschnell. Kostenlos im Browser.",
      intro: "Ermitteln Sie Nettobeträge, Umsatzsteuerbeträge und Bruttoendpreise für Ihre Angebote und Rechnungen mit einem Klick.",
      steps: ["Netto- oder Bruttobetrag eingeben", "Umsatzsteuersatz festlegen", "Exakte Aufschlüsselung sofort ablesen"],
      faqs: [
        { question: "Kann man Brutto in Netto umrechnen?", answer: "Ja, der Rechner funktioniert in beide Richtungen (MwSt aufschlagen oder herausrechnen)." },
        { question: "Gilt die Berechnung für gewerbliche Rechnungen?", answer: "Ja, alle Beträge werden kaufmännisch exakt auf zwei Nachkommastellen berechnet." }
      ]
    },
    id: {
      name: "Kalkulator Pajak & PPN",
      title: "Kalkulator Pajak & PPN Usaha Gratis Akurat",
      description: "Hitung nominal DPP, PPN, dan total harga bruto secara instan dan akurat untuk transaksi bisnis Anda. Gratis tanpa pendaftaran.",
      intro: "Hitung nilai Dasar Pengenaan Pajak (DPP), besaran persentase pajak, dan total harga akhir untuk transaksi usaha Anda secara instan.",
      steps: ["Masukkan harga sebelum atau sesudah pajak", "Pilih tarif persentase pajak", "Lihat rincian perhitungan pajak secara langsung"],
      faqs: [
        { question: "Bisakah menghitung harga include dan exclude pajak?", answer: "Bisa, Anda dapat menghitung penambahan pajak maupun memisahkan pajak dari harga total." },
        { question: "Apakah perhitungannya akurat untuk faktur?", answer: "Ya, perhitungan menggunakan pembulatan standar akuntansi bisnis." }
      ]
    }
  },
  "whatsapp-order-generator": {
    es: {
      name: "Generador de Pedidos WhatsApp",
      title: "Generador de Pedidos por WhatsApp para Tiendas",
      description: "Crea enlaces y catálogos de pedidos rápidos por WhatsApp para que tus clientes compren con un solo clic. Gratis y sin comisiones.",
      intro: "Genera enlaces de compra y pedidos formateados para que los clientes te envíen la lista de productos deseados directamente a tu WhatsApp.",
      steps: ["Indica tu número de teléfono y nombre del negocio", "Añade los artículos o mensaje predeterminado", "Comparte el enlace o código QR con tus clientes"],
      faqs: [
        { question: "¿Tiene algún coste o comisión por venta?", answer: "No, es una herramienta 100% gratuita y sin comisiones de intermediación." },
        { question: "¿Funciona en WhatsApp Web y móvil?", answer: "Sí, abre directamente la conversación con el mensaje listo para enviar en cualquier dispositivo." }
      ]
    },
    pt: {
      name: "Gerador de Pedidos WhatsApp",
      title: "Gerador de Pedidos por WhatsApp para Negócios",
      description: "Crie links de pedidos diretos para o WhatsApp da sua loja ou restaurante. Agilize suas vendas e receba pedidos organizados de graça.",
      intro: "Crie links de pedidos com mensagens padronizadas para receber compras de clientes diretamente no WhatsApp da sua loja.",
      steps: ["Digite seu número de WhatsApp com DDD", "Configure os produtos ou mensagem padrão", "Divulgue o link ou QR Code nas suas redes sociais"],
      faqs: [
        { question: "Cobram taxa sobre os pedidos?", answer: "Zero taxas. As negociações acontecem diretamente entre você e seu cliente." },
        { question: "Abre direto no aplicativo do cliente?", answer: "Sim, o cliente clica e a mensagem é carregada automaticamente no WhatsApp." }
      ]
    },
    fr: {
      name: "Générateur de Commandes WhatsApp",
      title: "Générateur de Commandes WhatsApp pour Boutiques",
      description: "Générez des liens de commande instantanés pour WhatsApp afin de recevoir les achats de vos clients en un clic. Gratuit et sans frais.",
      intro: "Permettez à vos clients de passer commande en un clic via WhatsApp avec un message préformaté contenant les détails de leurs achats.",
      steps: ["Indiquez votre numéro WhatsApp professionnel", "Configurez vos articles ou texte de commande", "Partagez le lien direct ou le QR code généré"],
      faqs: [
        { question: "Y a-t-il des commissions sur les ventes ?", answer: "Aucune commission. Vous gardez 100% de vos revenus." },
        { question: "Le client a-t-il besoin d'une app spéciale ?", answer: "Non, seule l'application WhatsApp habituelle est nécessaire." }
      ]
    },
    de: {
      name: "WhatsApp Bestell-Generator",
      title: "WhatsApp Bestell-Generator für Online-Shops",
      description: "Erstellen Sie direkte Bestell-Links für WhatsApp, damit Kunden per Klick bestellen können. Kostenlos und provisionsfrei im Browser.",
      intro: "Erstellen Sie vorbereitete Bestell-Nachrichten und Links für WhatsApp, damit Kunden Artikel direkt in Ihren Chat senden können.",
      steps: ["WhatsApp-Geschäftsnummer angeben", "Bestellvorlage oder Produkte definieren", "Link oder QR-Code an Kunden weitergeben"],
      faqs: [
        { question: "Fallen Vermittlungsgebühren an?", answer: "Nein, das Tool ist vollkommen kosten- und gebührenfrei." },
        { question: "Funktioniert das auch am Desktop?", answer: "Ja, der Link funktioniert mobil sowie mit WhatsApp Web am Computer." }
      ]
    },
    id: {
      name: "Generator Pesanan WhatsApp",
      title: "Generator Format Pesanan WhatsApp Toko Online",
      description: "Buat tautan pemesanan otomatis via WhatsApp untuk toko dan resto. Pelanggan pesan sekali klik, gratis tanpa potongan komisi.",
      intro: "Buat format pesan otomatis dan tautan cepat agar pembeli dapat mengirimkan pesanan produk secara rapi langsung ke WhatsApp toko Anda.",
      steps: ["Masukkan nomor WhatsApp toko Anda", "Atur format teks pesanan atau daftar menu", "Bagikan link atau QR Code ke media sosial"],
      faqs: [
        { question: "Apakah ada biaya komisi per transaksi?", answer: "Tidak ada sama sekali. Semua transaksi terjadi langsung antara Anda dan pembeli." },
        { question: "Apakah langsung membuka aplikasi WhatsApp?", answer: "Ya, tautan akan langsung membuka chat dengan draf pesanan yang siap dikirim." }
      ]
    }
  },
  "bulk-qr": {
    es: {
      name: "Generador de QR Masivo CSV",
      title: "Generador de Códigos QR Masivos por CSV Gratis",
      description: "Genera cientos de códigos QR en lote a partir de un archivo CSV o Excel y descárgalos en un archivo ZIP. 100% privado en tu navegador.",
      intro: "Sube un archivo CSV con enlaces o datos y genera cientos de imágenes de códigos QR de alta resolución listas para descargar en un archivo comprimido.",
      steps: ["Prepara tu archivo CSV con los datos", "Sube el archivo al generador", "Descarga todos los códigos QR en un archivo ZIP"],
      faqs: [
        { question: "¿Mis datos se suben a algún servidor?", answer: "No. Todo el procesamiento se realiza localmente en tu propio navegador web." },
        { question: "¿Hay límite en la cantidad de filas?", answer: "Puedes generar cientos de códigos QR a la vez de forma rápida y fluida." }
      ]
    },
    pt: {
      name: "Gerador de QR em Lote CSV",
      title: "Gerador de QR Code em Lote via CSV Grátis",
      description: "Gere múltiplos QR Codes em massa a partir de planilhas CSV ou Excel e baixe em arquivo ZIP. Processamento local, rápido e gratuito.",
      intro: "Carregue sua planilha CSV e gere dezenas ou centenas de imagens de QR Code em alta resolução, baixando tudo em um único arquivo ZIP.",
      steps: ["Organize seus links ou textos em uma coluna CSV", "Importe o arquivo para a ferramenta", "Faça o download do arquivo compactado ZIP"],
      faqs: [
        { question: "Os dados da minha planilha são compartilhados?", answer: "Não, todo o processo ocorre em memória dentro do seu navegador." },
        { question: "Os arquivos vêm nomeados?", answer: "Sim, cada imagem recebe o nome correspondente à linha da sua planilha." }
      ]
    },
    fr: {
      name: "Générateur de QR en Masse CSV",
      title: "Générateur de QR Codes en Masse par Fichier CSV",
      description: "Générez des centaines de QR codes par lot à partir d'un fichier CSV ou Excel et téléchargez-les en ZIP. Gratuit et privé en local.",
      intro: "Importez un fichier CSV et convertissez instantanément vos listes de liens ou références en images QR code regroupées dans une archive ZIP.",
      steps: ["Préparez votre fichier CSV avec vos liens", "Glissez-déposez le fichier dans l'outil", "Téléchargez l'archive ZIP contenant tous les QR codes"],
      faqs: [
        { question: "Les fichiers sont-ils envoyés sur un serveur ?", answer: "Non. La génération se fait entièrement dans votre navigateur pour une confidentialité maximale." },
        { question: "Quel est le format des images générées ?", answer: "Les QR codes sont exportés en images PNG haute définition." }
      ]
    },
    de: {
      name: "Massen-QR-Generator CSV",
      title: "Massen-QR-Code Generator via CSV-Upload Kostenlos",
      description: "Erstellen Sie Hunderte QR-Codes im Batch aus CSV-Dateien und laden Sie alle als ZIP herunter. Privat und clientseitig im Browser.",
      intro: "Generieren Sie Hunderte QR-Codes im Batch aus einer CSV-Tabelle und laden Sie alle Grafiken bequem als ZIP-Datei herunter.",
      steps: ["CSV-Tabelle mit Links oder Texten vorbereiten", "CSV-Datei hochladen", "Alle QR-Codes gesammelt als ZIP herunterladen"],
      faqs: [
        { question: "Bleiben meine Geschäftsdaten privat?", answer: "Ja, die Erstellung läuft zu 100% lokal in Ihrem Browser ohne Serverübertragung." },
        { question: "Wie viele Zeilen werden unterstützt?", answer: "Sie können Hunderte Einträge in einem Durchgang verarbeiten." }
      ]
    },
    id: {
      name: "Generator QR Massal CSV",
      title: "Generator QR Code Massal dari File CSV Gratis",
      description: "Buat ratusan QR Code sekaligus dari file CSV atau Excel dan unduh dalam bentuk ZIP. Proses cepat, gratis, dan privat di peramban.",
      intro: "Unggah dokumen CSV dan ubah seluruh baris data menjadi ratusan gambar QR Code berkualitas tinggi yang siap diunduh dalam file ZIP.",
      steps: ["Siapkan file CSV berisi daftar tautan atau teks", "Unggah file CSV ke aplikasi", "Unduh seluruh QR Code dalam satu file ZIP"],
      faqs: [
        { question: "Apakah data saya aman dan tidak bocor?", answer: "Sangat aman. Semua proses berlangsung lokal di browser komputer atau HP Anda." },
        { question: "Apakah gambar QR beresolusi tinggi?", answer: "Ya, format PNG beresolusi tajam dan mudah dibaca oleh pemindai barcode." }
      ]
    }
  },
  "invoice-generator": {
    es: {
      name: "Generador de Facturas",
      title: "Generador de Facturas en PDF Gratis para Autónomos",
      description: "Crea facturas profesionales en PDF para autónomos y empresas con cálculo automático de impuestos y descarga inmediata sin registro.",
      intro: "Genera facturas comerciales en PDF con tu logotipo, desglose de productos, cálculo automático de impuestos y datos bancarios listos para enviar a tus clientes.",
      steps: ["Rellena los datos de tu empresa y del cliente", "Añade los conceptos, precios e impuestos", "Descarga tu factura en PDF lista para imprimir o enviar"],
      faqs: [
        { question: "¿Se guardan mis facturas en algún servidor?", answer: "No. El PDF se compila localmente en tu dispositivo garantizando privacidad absoluta." },
        { question: "¿Puedo incluir mi logotipo y datos bancarios?", answer: "Sí, puedes personalizar todos los campos, logotipo, notas y condiciones de pago." }
      ]
    },
    pt: {
      name: "Gerador de Faturas",
      title: "Gerador de Faturas em PDF Grátis para Empresas",
      description: "Crie faturas comerciais profissionais em PDF para autônomos e empresas. Cálculo automático de impostos e download sem cadastro.",
      intro: "Emita faturas comerciais profissionais em PDF para seus clientes com cálculo automático de valores, logotipo e opções de pagamento.",
      steps: ["Preencha os dados do emissor e do cliente", "Adicione os itens faturados, valores e tributos", "Baixe a fatura em PDF pronta para envio"],
      faqs: [
        { question: "É seguro gerar faturas aqui?", answer: "Sim, seus dados financeiros não são enviados nem armazenados em nenhum servidor externo." },
        { question: "Posso adicionar logotipo e condições de pagamento?", answer: "Sim, é possível personalizar o cabeçalho, logo, prazos e dados bancários." }
      ]
    },
    fr: {
      name: "Générateur de Factures",
      title: "Générateur de Factures PDF Gratuit Professionnel",
      description: "Créez des factures professionnelles en PDF conformes pour indépendants et PME. Calcul automatique des totaux et téléchargement libre.",
      intro: "Établissez des factures professionnelles en PDF avec votre logo, détail des prestations, calcul de la TVA et coordonnées bancaires sans abonnement.",
      steps: ["Renseignez les coordonnées de votre société et du client", "Ajoutez les lignes de prestations et taux de TVA", "Téléchargez directement la facture PDF"],
      faqs: [
        { question: "Les factures sont-elles enregistrées en ligne ?", answer: "Non. Toute la génération se déroule en local dans votre navigateur." },
        { question: "Puis-je intégrer mon logo d'entreprise ?", answer: "Oui, vous pouvez importer votre logo et personnaliser les mentions de règlement." }
      ]
    },
    de: {
      name: "Rechnungsgenerator",
      title: "Kostenloser Rechnungsgenerator PDF für Firmen",
      description: "Erstellen Sie professionelle Rechnungen als druckbare PDF-Datei für Freiberufler und Gewerbe. Automatische Summenberechnung ohne Login.",
      intro: "Erstellen Sie übersichtliche Rechnungen im PDF-Format mit eigenem Logo, Positionen, Steuerausweis und Zahlungsangaben für Ihre Kunden.",
      steps: ["Absender- und Kundendaten eintragen", "Rechnungspositionen, Preise und MwSt ergänzen", "Fertige PDF-Rechnung sofort herunterladen"],
      faqs: [
        { question: "Werden meine Rechnungsdaten gespeichert?", answer: "Nein, alle Daten bleiben vertraulich und werden ausschließlich in Ihrem Browser verarbeitet." },
        { question: "Enthält die Rechnung alle Pflichtangaben?", answer: "Ja, alle Standardfelder für Rechnungsnummer, Datum, MwSt und Bankverbindung sind vorhanden." }
      ]
    },
    id: {
      name: "Generator Faktur Tagihan",
      title: "Generator Faktur Tagihan Invoice PDF Gratis UMKM",
      description: "Buat tagihan invoice profesional format PDF untuk bisnis dan freelancer. Hitung total dan pajak otomatis, gratis tanpa registrasi.",
      intro: "Buat faktur tagihan invoice usaha format PDF dengan logo perusahaan, rincian produk, pajak, dan nomor rekening pembayaran yang siap dikirim.",
      steps: ["Isi identitas usaha Anda dan data pembeli", "Tambahkan rincian barang, harga, dan diskon/pajak", "Unduh file invoice PDF siap kirim ke pelanggan"],
      faqs: [
        { question: "Apakah data transaksi disimpan di server?", answer: "Tidak. Seluruh pembuatan PDF terjadi di memori perangkat Anda tanpa disimpan di server." },
        { question: "Bisakah menambahkan logo toko?", answer: "Bisa, Anda dapat mengunggah logo usaha dan menambahkan catatan pembayaran kustom." }
      ]
    }
  },
  "receipt-generator": {
    es: {
      name: "Generador de Recibos",
      title: "Generador de Recibos de Pago en PDF Gratis",
      description: "Genera recibos de pago oficiales en PDF con firma, fecha, desglose de conceptos y logotipo de tu negocio al instante sin registro.",
      intro: "Emite comprobantes y recibos de pago en PDF para justificar cobros en efectivo o transferencias con fecha, concepto y firma.",
      steps: ["Indica el nombre del pagador y del cobrador", "Especifica el importe, concepto y forma de pago", "Descarga el recibo en PDF o imprímelo al instante"],
      faqs: [
        { question: "¿Sirve como comprobante de pago?", answer: "Sí, es un documento formal de recibo para justificar transacciones comerciales y servicios." },
        { question: "¿Puedo incluir firma digital?", answer: "Sí, incluye un espacio dedicado para firma o sello de tu comercio." }
      ]
    },
    pt: {
      name: "Gerador de Recibos",
      title: "Gerador de Recibos de Pagamento em PDF Grátis",
      description: "Crie recibos de pagamento profissionais em PDF com assinatura, data e dados da empresa. Rápido, seguro e gratuito no navegador.",
      intro: "Gere comprovantes e recibos de pagamento em PDF para comprovar recebimentos de clientes com data, descrição e assinatura.",
      steps: ["Preencha os nomes de quem pagou e quem recebeu", "Defina o valor pago e a descrição do serviço", "Baixe o recibo em PDF ou imprima imediatamente"],
      faqs: [
        { question: "O recibo é válido para comprovação?", answer: "Sim, serve como comprovante formal de quitação e pagamento de serviços." },
        { question: "É possível assinar o documento?", answer: "Sim, o modelo inclui campo para assinatura do recebedor." }
      ]
    },
    fr: {
      name: "Générateur de Reçus",
      title: "Générateur de Reçus de Paiement PDF Gratuit",
      description: "Émettez des reçus de paiement en PDF avec date, montant et signature pour vos clients. Outil gratuit sans création de compte.",
      intro: "Créez des reçus et justificatifs de paiement clairs en PDF pour attester de la bonne réception d'un règlement par virement ou espèces.",
      steps: ["Indiquez les noms du payeur et du bénéficiaire", "Précisez le montant réglé et le motif du paiement", "Téléchargez ou imprimez le reçu en PDF"],
      faqs: [
        { question: "Ce reçu fait-il foi de paiement ?", answer: "Oui, il constitue une preuve écrite et signée de la transaction effectuée." },
        { question: "Est-ce gratuit et sans inscription ?", answer: "Oui, vous pouvez créer autant de reçus que nécessaire sans inscription." }
      ]
    },
    de: {
      name: "Quittungsgenerator",
      title: "Kostenloser Quittungsgenerator PDF mit Unterschrift",
      description: "Erstellen und drucken Sie rechtssichere Zahlungsquittungen als PDF mit Datum, Betrag und Signaturfeld. 100% kostenlos im Browser.",
      intro: "Erstellen Sie saubere Zahlungsquittungen und Belege als druckfähige PDF-Datei zur Bestätigung erhaltener Bar- oder Überweisungszahlungen.",
      steps: ["Empfänger- und Zahlerdaten eingeben", "Zahlbetrag und Verwendungszweck erfassen", "PDF-Quittung herunterladen und unterschreiben"],
      faqs: [
        { question: "Gilt die Quittung als Zahlungsnachweis?", answer: "Ja, mit Datum und Unterschrift gilt die Quittung als ordnungsgemäßer Zahlungsbeleg." },
        { question: "Kostet die Nutzung etwas?", answer: "Nein, das Tool ist dauerhaft kostenfrei und ohne Benutzerkonto nutzbar." }
      ]
    },
    id: {
      name: "Generator Kuitansi Pembayaran",
      title: "Generator Kuitansi Pembayaran PDF Gratis Toko",
      description: "Buat bukti penerimaan pembayaran dan kuitansi PDF resmi lengkap dengan tanda tangan. Unduh gratis tanpa login atau watermark.",
      intro: "Cetak bukti penerimaan uang dan kuitansi pembayaran resmi dalam format PDF lengkap dengan rincian penerima, pembayar, dan tanda tangan.",
      steps: ["Isi nama pembayar dan nama penerima dana", "Tuliskan nominal uang dan peruntukan pembayaran", "Unduh file kuitansi PDF untuk dicetak atau dikirim"],
      faqs: [
        { question: "Apakah bisa digunakan sebagai bukti sah?", answer: "Ya, kuitansi mencantumkan tanggal, nominal, dan kolom tanda tangan resmi." },
        { question: "Apakah ada watermark pada hasil cetak?", answer: "Tidak ada watermark sama sekali. Bersih dan siap pakai." }
      ]
    }
  },
  "paid-stamp-generator": {
    es: {
      name: "Generador de Sello Pagado",
      title: "Generador de Sello Pagado para Facturas y Recibos",
      description: "Aplica sellos digitales de PAGADO personalizados con fecha y número de recibo sobre tus facturas y documentos en PDF e imágenes.",
      intro: "Genera un sello digital oficial con la palabra PAGADO, fecha de cobro y referencia para colocar en facturas y documentos comerciales.",
      steps: ["Personaliza el texto, color y fecha del sello", "Selecciona el estilo o sube tu documento", "Descarga el sello en PNG transparente o PDF sellado"],
      faqs: [
        { question: "¿El sello tiene fondo transparente?", answer: "Sí, se exporta en PNG con transparencia para superponerlo en cualquier documento." },
        { question: "¿Puedo cambiar la fecha y el color?", answer: "Sí, puedes elegir entre varios colores clásicos (rojo, verde, azul) y editar la fecha." }
      ]
    },
    pt: {
      name: "Gerador de Carimbo Pago",
      title: "Gerador de Carimbo PAGO para Faturas e Recibos",
      description: "Adicione carimbos digitais de PAGO com data e número de referência em faturas, recibos e documentos. Gratuito e instantâneo.",
      intro: "Crie carimbos digitais de PAGO personalizados com data e número de comprovante para validar suas faturas e recibos comerciais.",
      steps: ["Ajuste o texto, cor e data de pagamento", "Pré-visualize o carimbo digital", "Baixe a imagem em PNG com fundo transparente"],
      faqs: [
        { question: "O carimbo possui fundo transparente?", answer: "Sim, formato PNG transparente perfeito para colar em faturas ou PDFs." },
        { question: "Posso personalizar os dizeres do carimbo?", answer: "Sim, você pode alterar texto, data e referências livremente." }
      ]
    },
    fr: {
      name: "Générateur de Tampon Payé",
      title: "Générateur de Tampon PAYÉ pour Factures et Reçus",
      description: "Ajoutez un tampon numérique PAYÉ personnalisable avec date et référence sur vos documents et factures en PDF. Simple et gratuit.",
      intro: "Générez un tampon numérique professionnel marqué PAYÉ avec date et référence pour certifier l'encaissement de vos factures.",
      steps: ["Personnalisez la date, couleur et mention du tampon", "Vérifiez l'aperçu en direct", "Téléchargez l'image PNG avec fond transparent"],
      faqs: [
        { question: "L'image a-t-elle un fond transparent ?", answer: "Oui, le format PNG transparent permet de l'insérer sur tout document ou PDF." },
        { question: "Peut-on modifier la couleur du tampon ?", answer: "Oui, plusieurs couleurs professionnelles sont disponibles (rouge, vert, bleu)." }
      ]
    },
    de: {
      name: "Bezahlt-Stempel Generator",
      title: "Bezahlt-Stempel Generator für Rechnungen und Belege",
      description: "Fügen Sie einen digitalen BEZAHLT-Stempel mit Datum und Belegnummer auf Rechnungen und Dokumente ein. Kostenlos und browserbasiert.",
      intro: "Erstellen Sie digitale BEZAHLT-Stempel mit Datum und Buchungsvermerk zur schnellen Kennzeichnung beglichener Rechnungen.",
      steps: ["Text, Datum und Stempelfarbe anpassen", "Vorschau prüfen", "Stempelgrafik als transparente PNG-Datei herunterladen"],
      faqs: [
        { question: "Ist der Hintergrund transparent?", answer: "Ja, die PNG-Grafik hat einen transparenten Hintergrund zur flexiblen Platzierung." },
        { question: "Kann das Datum frei gewählt werden?", answer: "Ja, Sie können das Zahlungsdatum und die Belegnummer frei eintragen." }
      ]
    },
    id: {
      name: "Generator Cap Lunas",
      title: "Generator Cap Lunas Digital untuk Faktur & Kuitansi",
      description: "Tambahkan cap stempel LUNAS digital dengan tanggal dan nomor referensi pada invoice dan kuitansi Anda. Gratis tanpa registrasi.",
      intro: "Buat stempel LUNAS digital dengan tanggal pelunasan dan nomor referensi untuk disematkan pada faktur dan dokumen transaksi usaha.",
      steps: ["Sesuaikan teks stempel, tanggal, dan warna", "Lihat pratinjau hasil cap digital", "Unduh gambar stempel PNG transparan"],
      faqs: [
        { question: "Apakah latar belakang stempel transparan?", answer: "Ya, format PNG transparan sehingga bisa ditempelkan rapi di atas dokumen PDF atau gambar." },
        { question: "Apakah bisa mengubah warna cap?", answer: "Bisa, tersedia pilihan warna merah, hijau, atau biru sesuai kebutuhan." }
      ]
    }
  },
  "rent-receipt-generator": {
    es: {
      name: "Generador de Recibos de Alquiler",
      title: "Generador de Recibos de Alquiler en PDF Gratis",
      description: "Genera recibos de renta y alquiler de vivienda o local comercial en PDF con desglose de pagos y firma. 100% gratis y privado.",
      intro: "Crea recibos de alquiler mensuales en PDF para inquilinos y propietarios con dirección del inmueble, periodo de renta y firma.",
      steps: ["Introduce los datos del arrendador y arrendatario", "Especifica la dirección, periodo e importe mensual", "Descarga el recibo de alquiler en PDF"],
      faqs: [
        { question: "¿Sirve como justificante para deducciones fiscales?", answer: "Sí, contiene todos los datos necesarios para justificar el pago de alquiler." },
        { question: "¿Puedo generar recibos para locales comerciales?", answer: "Sí, funciona tanto para viviendas particulares como para locales comerciales." }
      ]
    },
    pt: {
      name: "Gerador de Recibos de Aluguel",
      title: "Gerador de Recibos de Aluguel em PDF Grátis",
      description: "Crie recibos de aluguel residencial e comercial em PDF com dados do locador, locatário e valor pago. Grátis e seguro no navegador.",
      intro: "Emita recibos mensais de aluguel em formato PDF para comprovar a quitação da locação entre locador e locatário.",
      steps: ["Insira o nome do locador e do inquilino", "Preencha o endereço do imóvel e valor do aluguel", "Gere o documento PDF pronto para assinar"],
      faqs: [
        { question: "O documento é válido para declaração de imposto?", answer: "Sim, traz os campos necessários para comprovação de rendimentos de aluguel." },
        { question: "Funciona para imóveis comerciais?", answer: "Sim, serve para locações residenciais e comerciais." }
      ]
    },
    fr: {
      name: "Générateur de Quittances de Loyer",
      title: "Générateur de Quittance de Loyer PDF Gratuit",
      description: "Générez des quittances de loyer conformes en PDF pour bailleurs et locataires avec calcul du loyer et charges. Téléchargement libre.",
      intro: "Établissez des quittances de loyer claires et conformes en PDF avec détail du loyer nu, des charges locatives et signature du propriétaire.",
      steps: ["Renseignez les coordonnées du bailleur et du locataire", "Indiquez l'adresse du bien, la période et le montant", "Téléchargez la quittance de loyer en PDF"],
      faqs: [
        { question: "La quittance est-elle conforme ?", answer: "Oui, elle détaille distinctement le loyer et les provisions sur charges." },
        { question: "Le service est-il gratuit ?", answer: "Oui, gratuit et accessible à tout moment sans créer de compte." }
      ]
    },
    de: {
      name: "Mietquittung Generator",
      title: "Kostenloser Mietquittungs-Generator PDF für Vermieter",
      description: "Erstellen Sie rechtssichere Mietquittungen als druckbare PDF-Datei für Wohn- und Gewerberäume. Schnell, kostenlos und ohne Anmeldung.",
      intro: "Erstellen Sie Mietquittungen und Zahlungsbestätigungen im PDF-Format für Mieter und Vermieter mit Mietzeitraum und Nebenkosten.",
      steps: ["Vermieter- und Mieterangaben eingeben", "Mietobjekt, Monat und Gesamtmiete erfassen", "Mietquittung als PDF herunterladen"],
      faqs: [
        { question: "Gilt das Dokument als Nachweis für Behörden?", answer: "Ja, die Quittung enthält alle notwendigen Angaben zur Mietzahlung." },
        { question: "Können Nebenkosten separat ausgewiesen werden?", answer: "Ja, Kaltmiete und Nebenkosten können getrennt aufgeführt werden." }
      ]
    },
    id: {
      name: "Generator Kuitansi Sewa",
      title: "Generator Kuitansi Sewa Rumah & Kos PDF Gratis",
      description: "Buat bukti kuitansi sewa rumah, kos, atau ruko dalam format PDF lengkap dengan tanda tangan pemilik. Gratis tanpa login peramban.",
      intro: "Buat bukti kuitansi pembayaran sewa rumah, kamar kos, atau ruko dalam format PDF lengkap dengan periode sewa dan tanda tangan.",
      steps: ["Isi nama pemilik properti dan penyewa", "Tuliskan alamat properti, periode sewa, dan tarif", "Unduh file kuitansi sewa PDF siap cetak"],
      faqs: [
        { question: "Apakah bisa untuk sewa bulanan dan tahunan?", answer: "Bisa, Anda bebas menentukan periode masa sewa yang diinginkan." },
        { question: "Apakah bisa langsung dicetak?", answer: "Ya, format PDF siap cetak di kertas ukuran standar." }
      ]
    }
  },
  "payment-reminder-generator": {
    es: {
      name: "Generador de Recordatorios de Pago",
      title: "Generador de Avisos y Recordatorios de Pago",
      description: "Redacta avisos amables y formales de cobro para facturas pendientes y compártelos por WhatsApp o correo. Gratis y sin comisiones.",
      intro: "Crea mensajes de cobro profesionales y cordiales para recordar a tus clientes el vencimiento de facturas pendientes de pago.",
      steps: ["Indica el nombre del cliente y número de factura", "Selecciona el tono del mensaje (cordial, formal o urgente)", "Copia el texto listo o envíalo directamente por WhatsApp"],
      faqs: [
        { question: "¿Puedo personalizar el texto del recordatorio?", answer: "Sí, todos los campos y plantillas de texto son totalmente editables." },
        { question: "¿Permite incluir el enlace o QR de pago?", answer: "Sí, puedes adjuntar el enlace para que el cliente pague en un clic." }
      ]
    },
    pt: {
      name: "Gerador de Lembretes de Cobrança",
      title: "Gerador de Lembretes de Cobrança e Pagamento",
      description: "Crie mensagens profissionais de cobrança para clientes com faturas pendentes e envie pelo WhatsApp ou e-mail. Grátis e sem cadastro.",
      intro: "Elabore mensagens de cobrança amigáveis e eficazes para lembrar clientes sobre faturas ou mensalidades próximas do vencimento.",
      steps: ["Informe o nome do cliente e valor pendente", "Escolha o tom da mensagem (amigável, formal ou cobrança)", "Copie o texto ou envie diretamente pelo WhatsApp"],
      faqs: [
        { question: "As mensagens ajudam a receber mais rápido?", answer: "Sim, lembretes claros com link de pagamento reduzem a inadimplência." },
        { question: "Posso usar para cobranças recorrentes?", answer: "Sim, ideal para mensalidades, serviços e vendas a prazo." }
      ]
    },
    fr: {
      name: "Générateur de Relances de Paiement",
      title: "Générateur de Relance de Paiement et Factures",
      description: "Rédigez des lettres et messages de relance courtois et fermes pour vos factures impayées. Modèles prêts à l'envoi par e-mail/WhatsApp.",
      intro: "Rédigez des messages de rappel et lettres de relance claires et professionnelles pour encourager le règlement rapide de vos factures.",
      steps: ["Indiquez le client, la facture et la date d'échéance", "Sélectionnez le niveau de relance (1ère relance, rappel, mise en demeure)", "Copiez le modèle ou envoyez-le par e-mail"],
      faqs: [
        { question: "Les modèles respectent-ils les usages professionnels ?", answer: "Oui, les formulations allient politesse et fermeté juridique." },
        { question: "Est-ce gratuit pour toutes les relances ?", answer: "Oui, utilisation libre et illimitée sans frais." }
      ]
    },
    de: {
      name: "Zahlungserinnerung Generator",
      title: "Zahlungserinnerung & Mahnung Generator Kostenlos",
      description: "Erstellen Sie professionelle und freundliche Zahlungserinnerungen für offene Rechnungen. Vorlagen direkt kopieren oder als PDF exportieren.",
      intro: "Formulieren Sie rechtssichere und freundliche Zahlungserinnerungen und Mahnungen für säumige Kunden in wenigen Schritten.",
      steps: ["Kundendaten, Rechnungsnummer und Betrag angeben", "Mahnstufe wählen (Freundliche Erinnerung bis Mahnung)", "Mustertext kopieren oder als PDF ausgeben"],
      faqs: [
        { question: "Welche Fristen sollten gesetzt werden?", answer: "Üblich sind Zahlungsfristen von 7 bis 14 Tagen." },
        { question: "Können Mahngebühren eingefügt werden?", answer: "Ja, Verzugszinsen und Pauschalen können optional ergänzt werden." }
      ]
    },
    id: {
      name: "Generator Pengingat Pembayaran",
      title: "Generator Pengingat Tagihan & Pembayaran Sopan",
      description: "Susun pesan pengingat tagihan jatuh tempo yang sopan dan profesional untuk pelanggan via WhatsApp dan email. Gratis tanpa daftar.",
      intro: "Buat draf pesan pengingat tagihan pembayaran yang sopan namun tegas untuk dikirimkan kepada pelanggan melalui chat atau email.",
      steps: ["Masukkan nama pelanggan dan nomor tagihan", "Pilih nada pesan (ramah, formal, atau penegasan)", "Salin teks atau kirim langsung ke WhatsApp pelanggan"],
      faqs: [
        { question: "Apakah ada berbagai pilihan template pesan?", answer: "Ya, tersedia opsi pesan ramah sebelum jatuh tempo hingga peringatan resmi." },
        { question: "Bisakah menyertakan link pembayaran langsung?", answer: "Bisa, Anda dapat menyisipkan nomor rekening atau tautan pembayaran." }
      ]
    }
  },
  "quotation-generator": {
    es: {
      name: "Generador de Presupuestos",
      title: "Generador de Presupuestos y Cotizaciones en PDF",
      description: "Elabora presupuestos comerciales y cotizaciones profesionales en PDF con desglose de costes, validez y términos. Gratis en tu navegador.",
      intro: "Diseña cotizaciones y presupuestos profesionales en PDF para presentar precios, plazos y condiciones a tus clientes potenciales.",
      steps: ["Rellena los datos de tu empresa y del cliente", "Añade las partidas, precios y periodo de validez", "Descarga el presupuesto en PDF listo para enviar"],
      faqs: [
        { question: "¿Puedo definir la fecha de validez del presupuesto?", answer: "Sí, puedes fijar el plazo límite en el que los precios se mantienen vigentes." },
        { question: "¿Es posible convertirlo en factura luego?", answer: "Sí, puedes usar la misma información en el generador de facturas." }
      ]
    },
    pt: {
      name: "Gerador de Orçamentos",
      title: "Gerador de Orçamentos Comerciais em PDF Grátis",
      description: "Crie orçamentos de serviços e propostas comerciais em PDF com itens detalhados, prazos e condições de pagamento. Grátis e sem cadastro.",
      intro: "Gere orçamentos e propostas comerciais completas em PDF com tabela de serviços, prazos de entrega e condições de pagamento.",
      steps: ["Preencha seus dados de contato e os do cliente", "Liste os itens, valores e prazo de validade da proposta", "Baixe a proposta em PDF pronta para apresentação"],
      faqs: [
        { question: "Posso incluir prazos de entrega e validade?", answer: "Sim, há campos dedicados para validade da proposta e condições gerais." },
        { question: "É adequado para prestadores de serviços?", answer: "Perfeito para freelancers, técnicos, consultores e pequenas empresas." }
      ]
    },
    fr: {
      name: "Générateur de Devis",
      title: "Générateur de Devis Professionnel PDF Gratuit",
      description: "Créez des devis commerciaux clairs et détaillés au format PDF pour vos prestations et ventes. Calculs automatiques et téléchargement libre.",
      intro: "Éditez des devis professionnels en PDF conformes aux exigences commerciales avec calcul automatique des totaux et durée de validité.",
      steps: ["Renseignez les coordonnées de l'émetteur et du prospect", "Détaillez les lignes de devis, quantités et prix", "Téléchargez votre devis PDF prêt à être signé"],
      faqs: [
        { question: "Le devis comporte-t-il une zone de signature ?", answer: "Oui, un emplacement pour la signature et la mention 'Bon pour accord' est prévu." },
        { question: "Le service nécessite-t-il une carte bancaire ?", answer: "Non, c'est un outil 100% gratuit et sans abonnement." }
      ]
    },
    de: {
      name: "Angebotsgenerator",
      title: "Kostenloser Kostenvoranschlag & Angebotsgenerator PDF",
      description: "Erstellen Sie professionelle Angebote und Kostenvoranschläge als PDF für Ihre Kunden. Automatische Berechnung und sofortiger Druck.",
      intro: "Erstellen Sie aussagekräftige Angebote und Kostenvoranschläge im PDF-Format mit Leistungsverzeichnis, Preisen und Gültigkeitsdauer.",
      steps: ["Firmendaten und Interessenten eingeben", "Angebotspositionen und Konditionen ergänzen", "PDF-Angebot herunterladen und an den Kunden senden"],
      faqs: [
        { question: "Kann eine Bindefrist angegeben werden?", answer: "Ja, die Gültigkeitsdauer des Angebots kann flexibel eingetragen werden." },
        { question: "Ist der Angebotsgenerator für Handwerker geeignet?", answer: "Ja, optimal für Dienstleister, Handwerker und Freiberufler." }
      ]
    },
    id: {
      name: "Generator Surat Penawaran",
      title: "Generator Surat Penawaran Harga PDF Gratis UMKM",
      description: "Buat surat penawaran harga (quotation) resmi format PDF untuk klien bisnis dan proyek Anda. Hitung total otomatis tanpa watermark.",
      intro: "Susun surat penawaran harga resmi (quotation) dalam format PDF dengan rincian barang/jasa, masa berlaku penawaran, dan syarat pembayaran.",
      steps: ["Lengkapi data perusahaan Anda dan calon pembeli", "Rinci daftar barang, harga satuan, dan masa berlaku harga", "Unduh surat penawaran harga PDF siap kirim"],
      faqs: [
        { question: "Apakah ada tempat tanda tangan persetujuan klien?", answer: "Ya, terdapat kolom tanda tangan persetujuan penawaran resmi." },
        { question: "Apakah bisa memasukkan syarat dan ketentuan proyek?", answer: "Bisa, tersedia kolom khusus untuk syarat pembayaran dan catatan garansi." }
      ]
    }
  },
  "split-bill-calculator": {
    es: {
      name: "Calculadora de Dividir Cuenta",
      title: "Calculadora para Dividir Cuentas y Propinas Gratis",
      description: "Divide la cuenta del restaurante entre amigos de forma equitativa o por consumos individuales con cálculo de propina exacto al instante.",
      intro: "Calcula con precisión cuánto debe pagar cada persona al compartir una comida o evento, incluyendo propinas e impuestos de manera justa.",
      steps: ["Introduce el total de la cuenta y el porcentaje de propina", "Indica el número de personas en el grupo", "Comprueba la cantidad exacta que corresponde a cada uno"],
      faqs: [
        { question: "¿Permite calcular propinas personalizadas?", answer: "Sí, puedes elegir porcentajes estándar o introducir un porcentaje manual." },
        { question: "¿Funciona sin conexión a internet?", answer: "Sí, los cálculos se realizan localmente en tu navegador al instante." }
      ]
    },
    pt: {
      name: "Divisor de Contas",
      title: "Calculadora para Dividir Conta de Restaurante",
      description: "Divida a conta do bar ou restaurante entre amigos com cálculo de gorjeta e consumo individual. Fácil, rápido e gratuito no navegador.",
      intro: "Descubra o valor exato a ser pago por cada pessoa na mesa do bar ou restaurante, incluindo taxa de serviço de forma justa.",
      steps: ["Digite o valor total da comanda", "Selecione a porcentagem da gorjeta ou taxa de serviço", "Veja o valor exato por pessoa instantaneamente"],
      faqs: [
        { question: "Posso alterar o percentual de serviço?", answer: "Sim, você pode ajustar a taxa de 10%, 15% ou qualquer valor personalizado." },
        { question: "É rápido de usar no celular?", answer: "Sim, interface leve e rápida para usar diretamente na mesa do restaurante." }
      ]
    },
    fr: {
      name: "Calculateur de Partage d'Addition",
      title: "Calculateur pour Partager une Addition au Restaurant",
      description: "Partagez la note du restaurant entre amis équitablement ou par consommation avec calcul du pourboire. Gratuit, simple et sans calculatrice.",
      intro: "Partagez équitablement l'addition du restaurant entre convives en incluant automatiquement le pourboire ou les frais de service.",
      steps: ["Entrez le montant global de l'addition", "Indiquez le pourcentage de pourboire souhaité", "Consultez la part exacte due par chaque participant"],
      faqs: [
        { question: "Peut-on personnaliser le pourboire ?", answer: "Oui, le pourcentage de pourboire est entièrement personnalisable." },
        { question: "L'outil est-il adapté aux smartphones ?", answer: "Oui, pensé pour un usage immédiat et fluide sur mobile." }
      ]
    },
    de: {
      name: "Rechnung teilen Rechner",
      title: "Rechnung teilen Rechner mit Trinkgeld Kostenlos",
      description: "Teilen Sie Restaurant-Rechnungen fair unter Freunden auf — inklusive exakter Trinkgeldberechnung. Kostenlos und blitzschnell im Browser.",
      intro: "Teilen Sie Rechnungen im Restaurant oder Café schnell und unkompliziert auf mehrere Personen auf — inklusive Trinkgeld-Empfehlung.",
      steps: ["Rechnungsbetrag und Trinkgeld-Prozentsatz eingeben", "Personenanzahl festlegen", "Genauen Betrag pro Person ablesen"],
      faqs: [
        { question: "Kann man unterschiedliche Trinkgeld-Sätze berechnen?", answer: "Ja, gängige Sätze wie 5%, 10%, 15% oder freie Beträge sind wählbar." },
        { question: "Ist der Rechner anonym nutzbar?", answer: "Ja, keine Registrierung oder Datenspeicherung erforderlich." }
      ]
    },
    id: {
      name: "Kalkulator Bagi Tagihan",
      title: "Kalkulator Bagi Tagihan & Split Bill Restoran",
      description: "Hitung pembagian tagihan makan bersama teman secara merata atau per item pesanan termasuk pajak dan tip. Gratis dan mudah digunakan.",
      intro: "Hitung pembagian tagihan makan bersama teman di kafe atau resto secara merata, lengkap dengan hitungan pajak restoran dan tip pelayan.",
      steps: ["Masukkan total biaya tagihan makanan", "Tentukan persentase pajak dan tip jika ada", "Lihat nominal yang harus dibayar oleh masing-masing orang"],
      faqs: [
        { question: "Bisakah memasukkan biaya layanan dan pajak sekaligus?", answer: "Bisa, Anda dapat menambahkan persentase service charge dan pajak resto." },
        { question: "Apakah hasilnya akurat sampai rupiah terkecil?", answer: "Ya, pembagian dihitung presisi untuk menghindari selisih bayar." }
      ]
    }
  },
  "cash-denomination-calculator": {
    es: {
      name: "Contador de Billetes y Efectivo",
      title: "Contador de Billetes y Monedas de Caja Gratis",
      description: "Calcula el arqueo de caja diario sumando el número de billetes y monedas por denominación. Total exacto para comercios sin errores.",
      intro: "Realiza el recuento de efectivo y arqueo de caja diario introduciendo la cantidad de billetes y monedas de cada valor.",
      steps: ["Introduce la cantidad de piezas para cada denominación", "El total se calcula en tiempo real automáticamente", "Copia el desglose para el registro de tu caja"],
      faqs: [
        { question: "¿Evita errores en el recuento de caja?", answer: "Sí, multiplica y suma al instante cada valor para garantizar cuadres de caja exactos." },
        { question: "¿Se puede usar en cualquier país?", answer: "Sí, admite denominaciones estándar y cantidades flexibles." }
      ]
    },
    pt: {
      name: "Calculadora de Fechamento de Caixa",
      title: "Contador de Cédulas e Moedas de Caixa Grátis",
      description: "Faça o fechamento de caixa diário somando notas e moedas por denominação. Totalize o saldo do seu comércio com precisão instantânea.",
      intro: "Conte o dinheiro do caixa da sua loja de forma rápida, somando notas e moedas por valor facial sem chance de erros de cálculo.",
      steps: ["Digite a quantidade de cada cédula e moeda", "Acompanhe o total acumulado em tempo real", "Copie o resumo para o relatório de fechamento de caixa"],
      faqs: [
        { question: "Ajuda no fechamento diário do comércio?", answer: "Sim, agiliza a conferência de gaveta e reduz divergências de caixa." },
        { question: "É seguro para uso em lojas?", answer: "Totalmente seguro e privado, nada fica gravado em servidores." }
      ]
    },
    fr: {
      name: "Calculateur de Caisse et Espèces",
      title: "Calculateur de Caisse et Comptage d'Espèces",
      description: "Effectuez votre clôture de caisse quotidienne en renseignant le nombre de billets et pièces. Total précis et exportable pour commerces.",
      intro: "Facilitez le comptage de fond de caisse et la clôture journalière en saisissant le nombre de billets et pièces de chaque dénomination.",
      steps: ["Indiquez le nombre de billets et pièces par valeur", "Consultez le total calculé automatiquement en direct", "Copiez le récapitulatif pour votre journal de caisse"],
      faqs: [
        { question: "Est-ce utile pour la comptabilité du magasin ?", answer: "Oui, cela accélère la vérification des encaissements en espèces." },
        { question: "L'outil gère-t-il les centimes ?", answer: "Oui, toutes les coupures et pièces sont prises en charge." }
      ]
    },
    de: {
      name: "Bargeldrechner & Kassenabschluss",
      title: "Bargeldrechner & Kassenabschluss Zählhilfe",
      description: "Erfassen und summieren Sie Geldscheine und Münzen für den täglichen Kassenabschluss. Exakte Summe für Kassenbestand ohne Rechenfehler.",
      intro: "Zählen Sie Ihren Kassenbestand schnell und fehlerfrei ab, indem Sie Stückzahlen der jeweiligen Banknoten und Münzen eingeben.",
      steps: ["Anzahl der Scheine und Münzen pro Nennwert eintragen", "Gesamtsumme in Echtzeit ablesen", "Zählliste für den Kassenbericht kopieren"],
      faqs: [
        { question: "Verhindert das Tool Rechenfehler beim Kassensturz?", answer: "Ja, alle Teilsummen und die Gesamtsumme werden exakt berechnet." },
        { question: "Können Daten ausgedruckt werden?", answer: "Ja, das Ergebnis lässt sich kopieren oder direkt über den Browser drucken." }
      ]
    },
    id: {
      name: "Kalkulator Hitung Uang Kas",
      title: "Kalkulator Hitung Pecahan Uang & Kasir Toko",
      description: "Hitung total uang fisik dan pecahan uang kasir toko harian secara akurat dan cepat. Bebas salah hitung, gratis tanpa perlu mendaftar.",
      intro: "Hitung total saldo fisik uang tunai di laci kasir toko Anda dengan memasukkan jumlah lembar uang kertas dan keping koin secara instan.",
      steps: ["Masukkan jumlah lembar atau keping untuk setiap pecahan uang", "Total nominal dihitung otomatis seketika", "Salin rincian rekapan untuk buku kas harian toko"],
      faqs: [
        { question: "Apakah membantu tutup kasir harian?", answer: "Sangat membantu mempercepat proses penghitungan uang fisik saat pergantian shift atau tutup toko." },
        { question: "Apakah mendukung semua pecahan uang?", answer: "Ya, mendukung seluruh pecahan uang kertas dan koin yang beredar." }
      ]
    }
  },
  "credit-note-generator": {
    es: {
      name: "Generador de Notas de Crédito",
      title: "Generador de Notas de Crédito en PDF Gratis",
      description: "Emite notas de crédito oficiales en PDF para devoluciones, reembolsos y ajustes sobre facturas emitidas. Descarga libre y sin registro.",
      intro: "Genera notas de crédito comerciales en PDF para documentar devoluciones de productos, rectificaciones de facturas o abonos a clientes.",
      steps: ["Indica la factura de referencia y los datos de las partes", "Especifica el motivo y el importe a abonar", "Descarga la nota de crédito en formato PDF"],
      faqs: [
        { question: "¿Para qué sirve una nota de crédito?", answer: "Permite anular o reducir legalmente el importe de una factura previamente emitida." },
        { question: "¿Es válida para la contabilidad oficial?", answer: "Sí, incluye todos los campos reglamentarios para control contable." }
      ]
    },
    pt: {
      name: "Gerador de Notas de Crédito",
      title: "Gerador de Notas de Crédito em PDF Grátis",
      description: "Crie notas de crédito profissionais em PDF para estornos, devoluções e descontos aplicados. 100% gratuito e privado no navegador.",
      intro: "Emita notas de crédito em PDF para formalizar devoluções de mercadorias, descontos concedidos ou ajustes em faturas anteriores.",
      steps: ["Referencie a fatura original e dados do cliente", "Informe os itens devolvidos ou valor do estorno", "Gere e baixe a nota de crédito em PDF"],
      faqs: [
        { question: "Quando devo emitir uma nota de crédito?", answer: "Sempre que houver devolução de produto ou necessidade de estorno de valor faturado." },
        { question: "É seguro emitir aqui?", answer: "Sim, geração 100% local no seu navegador com total privacidade." }
      ]
    },
    fr: {
      name: "Générateur d'Avoirs et Crédits",
      title: "Générateur d'Avoir et Note de Crédit PDF Gratuit",
      description: "Émettez des factures d'avoir et notes de crédit conformes en PDF pour remboursements ou annulations. Téléchargement immédiat et sécurisé.",
      intro: "Créez des factures d'avoir et notes de crédit en PDF pour rectifier une facture existante, acter un retour de marchandise ou un geste commercial.",
      steps: ["Renseignez le numéro de facture initiale et coordonnées", "Détaillez le montant de l'avoir et la TVA correspondante", "Téléchargez l'avoir au format PDF"],
      faqs: [
        { question: "Quelle est l'utilité d'un avoir ?", answer: "Il permet d'annuler légalement tout ou partie d'une facture déjà émise." },
        { question: "Le calcul de TVA est-il automatique ?", answer: "Oui, la TVA sur l'avoir est calculée selon le taux sélectionné." }
      ]
    },
    de: {
      name: "Gutschrift Generator",
      title: "Kostenloser Gutschrift-Generator PDF für Firmen",
      description: "Erstellen Sie rechtssichere Gutschriften und Stornorechnungen als PDF-Dokument für Ihre Kunden. Einfach, kostenlos und ohne Registrierung.",
      intro: "Erstellen Sie Gutschriften und Rechnungskorrekturen als PDF bei Retouren, Preisnachlässen oder Stornierungen für Ihre Kunden.",
      steps: ["Ursprüngliche Rechnungsnummer und Parteien angeben", "Gutschriftsbetrag und Grund eintragen", "PDF-Gutschrift herunterladen und versenden"],
      faqs: [
        { question: "Wann benötigt man eine Gutschrift?", answer: "Bei Warenrücksendungen, nachträglichen Rabatten oder Rechnungsstornierungen." },
        { question: "Erfüllt das Dokument steuerliche Anforderungen?", answer: "Ja, alle Pflichtangaben zur Verrechnung mit der Originalrechnung sind enthalten." }
      ]
    },
    id: {
      name: "Generator Nota Kredit",
      title: "Generator Nota Kredit & Retur Faktur PDF Gratis",
      description: "Buat nota kredit resmi untuk retur barang, diskon susulan, dan pembatalan faktur format PDF. Gratis dan aman langsung di peramban.",
      intro: "Buat nota kredit (credit note) resmi dalam format PDF untuk mencatat pengembalian barang, penyesuaian harga, atau koreksi faktur penjualan.",
      steps: ["Tuliskan nomor faktur acuan dan data pelanggan", "Rincikan nilai retur barang atau potongan harga", "Unduh dokumen nota kredit PDF resmi"],
      faqs: [
        { question: "Kapan nota kredit digunakan?", answer: "Saat pembeli mengembalikan barang rusak atau terdapat revisi pengurangan tagihan faktur." },
        { question: "Apakah ada biaya pembuatan dokumen?", answer: "100% gratis tanpa biaya langganan apa pun." }
      ]
    }
  },
  "emi-calculator": {
    es: {
      name: "Calculadora de Préstamos y Cuotas",
      title: "Calculadora de Cuotas de Préstamos y Créditos",
      description: "Calcula la cuota mensual de tu hipoteca o préstamo personal con el desglose de amortización e intereses totales. Gratis y sin registro.",
      intro: "Calcula la mensualidad exacta de tu hipoteca, crédito automotriz o préstamo personal según el capital, tipo de interés y plazo.",
      steps: ["Introduce el monto del préstamo", "Indica la tasa de interés anual y el plazo en meses o años", "Visualiza la cuota mensual y el total de intereses"],
      faqs: [
        { question: "¿Cómo se calcula la cuota mensual?", answer: "Utiliza la fórmula estándar de amortización financiera con cuotas constantes." },
        { question: "¿Muestra el total de intereses a pagar?", answer: "Sí, desglosa el coste total del crédito y los intereses acumulados." }
      ]
    },
    pt: {
      name: "Calculadora de Empréstimos e Parcelas",
      title: "Calculadora de Financiamento e Parcelas Grátis",
      description: "Calcule o valor da parcela mensal e os juros totais de financiamentos e empréstimos pessoais com tabela detalhada. Grátis no navegador.",
      intro: "Simule parcelas de financiamentos imobiliários, de veículos e empréstimos pessoais com taxa de juros e prazo personalizável.",
      steps: ["Informe o valor financiado", "Digite a taxa de juros e o número de parcelas", "Confira o valor da parcela mensal e o custo total"],
      faqs: [
        { question: "A simulação é precisa?", answer: "Sim, utiliza a tabela de amortização padrão de instituições financeiras." },
        { question: "Posso simular prazos em meses e anos?", answer: "Sim, você pode alternar facilmente entre prazos mensais e anuais." }
      ]
    },
    fr: {
      name: "Calculateur de Crédit et Mensualités",
      title: "Calculateur de Prêt et Mensualités de Crédit",
      description: "Calculez le montant de vos mensualités de crédit immobilier ou consommation et le coût total des intérêts. Gratuit, précis et rapide.",
      intro: "Estimez vos mensualités de remboursement pour un emprunt immobilier ou un crédit personnel en fonction du taux et de la durée.",
      steps: ["Saisissez le capital emprunté", "Indiquez le taux d'intérêt annuel et la durée", "Visualisez immédiatement la mensualité et le coût total du crédit"],
      faqs: [
        { question: "Comment est calculée la mensualité ?", answer: "Le calcul applique la formule mathématique standard des prêts amortissables à taux fixe." },
        { question: "Le tableau d'amortissement est-il inclus ?", answer: "Oui, la ventilation entre capital et intérêts est détaillée." }
      ]
    },
    de: {
      name: "Kreditrechner & Ratenrechner",
      title: "Kreditrechner & Ratenrechner für Darlehen",
      description: "Berechnen Sie monatliche Kreditraten, Zinskosten und Tilgungspläne für Ratenkredite und Baufinanzierungen. Kostenlos und neutral.",
      intro: "Ermitteln Sie die monatliche Rate und die Gesamtzinskosten für Ratenkredite, Autokredite oder Baufinanzierungen.",
      steps: ["Kreditbetrag eingeben", "Sollzins p.a. und Laufzeit festlegen", "Monatliche Rate und Gesamtkosten sofort einsehen"],
      faqs: [
        { question: "Ist der Rechner für alle Kreditarten geeignet?", answer: "Ja, für Ratenkredite, Autofinanzierungen und Baufinanzierungsdarlehen." },
        { question: "Werden Sondertilgungen berücksichtigt?", answer: "Der Rechner zeigt den Standard-Tilgungsverlauf bei gleichbleibender Annuität." }
      ]
    },
    id: {
      name: "Kalkulator Cicilan Kredit",
      title: "Kalkulator Angsuran Pinjaman & Bunga Kredit",
      description: "Hitung besaran cicilan bulanan dan total bunga pinjaman bank atau kredit usaha dengan mudah. Hasil akurat, gratis tanpa syarat login.",
      intro: "Hitung perkiraan angsuran bulanan dan akumulasi bunga untuk pinjaman modal usaha, KPR, atau kredit kendaraan bermotor.",
      steps: ["Masukkan jumlah pokok pinjaman", "Tentukan suku bunga tahunan dan tenor pinjaman", "Lihat estimasi cicilan per bulan dan total pengembalian"],
      faqs: [
        { question: "Apakah menggunakan metode bunga anuitas standar?", answer: "Ya, perhitungan menggunakan rumus angsuran tetap standar perbankan." },
        { question: "Apakah bisa digunakan untuk tenor tahunan?", answer: "Bisa, Anda dapat memilih jangka waktu pinjaman dalam bulan atau tahun." }
      ]
    }
  },
  "gratuity-calculator": {
    es: {
      name: "Calculadora de Indemnización Laboral",
      title: "Calculadora de Finiquito e Indemnización Laboral",
      description: "Estima las prestaciones por fin de contrato, antigüedad y liquidación laboral según los años de servicio trabajados. Gratuito y confidencial.",
      intro: "Estima el importe correspondiente por finiquito o compensación por años de servicio en función de tu último salario y antigüedad laboral.",
      steps: ["Introduce tu último salario bruto mensual", "Indica los años y meses de antigüedad en la empresa", "Visualiza la compensación estimada al instante"],
      faqs: [
        { question: "¿Cómo se calcula la antigüedad laboral?", answer: "Se contabilizan los años completos de servicio según la legislación aplicable." },
        { question: "¿Los cálculos son privados?", answer: "Sí, todos los cálculos se realizan localmente en tu navegador sin registro." }
      ]
    },
    pt: {
      name: "Calculadora de Rescisão Trabalhista",
      title: "Calculadora de Rescisão de Contrato de Trabalho",
      description: "Calcule o valor estimado de rescisão, verbas trabalhistas e indenização por tempo de serviço. Simulação rápida e gratuita no navegador.",
      intro: "Simule os valores devidos por tempo de serviço e rescisão contratual com base no último salário e tempo de casa.",
      steps: ["Informe o último salário base recebido", "Insira o tempo de serviço trabalhado", "Veja o valor estimado da indenização imediatamente"],
      faqs: [
        { question: "A simulação considera os meses trabalhados?", answer: "Sim, considera o tempo de serviço proporcional." },
        { question: "É uma ferramenta confidencial?", answer: "Sim, nenhum dado salarial é salvo em nenhum lugar." }
      ]
    },
    fr: {
      name: "Calculateur d'Indemnité de Départ",
      title: "Calculateur d'Indemnité de Licenciement et Départ",
      description: "Estimez le montant de votre indemnité légale de licenciement ou départ selon votre ancienneté et salaire. Outil d'estimation gratuit.",
      intro: "Estimez le montant de l'indemnité de fin de contrat ou de départ selon votre dernier salaire de référence et vos années d'ancienneté.",
      steps: ["Renseignez votre salaire brut mensuel de référence", "Précisez votre ancienneté en années et mois", "Obtenez l'estimation du montant de l'indemnité"],
      faqs: [
        { question: "Le calcul respecte-t-il les barèmes habituels ?", answer: "Oui, il applique les coefficients de calcul proportionnels à l'ancienneté." },
        { question: "Les données restent-elles confidentielles ?", answer: "Absolument, aucun stockage de données n'est effectué." }
      ]
    },
    de: {
      name: "Abfindungsrechner",
      title: "Abfindungsrechner & Kündigungsabfindung Kostenlos",
      description: "Berechnen Sie die voraussichtliche Abfindung bei Beendigung des Arbeitsverhältnisses basierend auf Betriebszugehörigkeit und Gehalt.",
      intro: "Berechnen Sie die übliche Abfindungshöhe bei Beendigung des Arbeitsverhältnisses anhand von Monatsgehalt und Betriebszugehörigkeit.",
      steps: ["Monatliches Bruttogehalt eintragen", "Dauer der Betriebszugehörigkeit angeben", "Voraussichtliche Abfindungssumme berechnen"],
      faqs: [
        { question: "Welche Berechnungsformel wird verwendet?", answer: "Die gängige Faustformel (0,5 Monatsgehälter pro Beschäftigungsjahr) sowie anpassbare Faktoren." },
        { question: "Ist der Rechner kostenfrei?", answer: "Ja, vollkommen kostenlos und ohne persönliche Registrierung nutzbar." }
      ]
    },
    id: {
      name: "Kalkulator Pesangon Karyawan",
      title: "Kalkulator Uang Pesangon & PHK Karyawan Akurat",
      description: "Hitung perkiraan uang pesangon, penghargaan masa kerja, dan kompensasi PHK berdasarkan masa kerja. Cepat, gratis, dan privat.",
      intro: "Hitung estimasi uang pesangon, uang penghargaan masa kerja (UPMK), dan uang penggantian hak sesuai masa kerja dan gaji pokok.",
      steps: ["Masukkan nominal upah pokok bulanan terakhir", "Tentukan masa kerja dalam tahun dan bulan", "Lihat rincian hak pesangon yang diestimasi"],
      faqs: [
        { question: "Apakah perhitungan mengacu pada aturan standar ketenagakerjaan?", answer: "Ya, formula menghitung komponen pesangon dan masa kerja proporsional." },
        { question: "Apakah data gaji saya tersimpan?", answer: "Tidak. Data hanya diproses sementara di layar browser Anda." }
      ]
    }
  },
  "sip-calculator": {
    es: {
      name: "Calculadora de Interés Compuesto",
      title: "Calculadora de Inversión e Interés Compuesto",
      description: "Calcula el crecimiento de tus ahorros e inversiones periódicas con el poder del interés compuesto. Gráficos interactivos y gratis.",
      intro: "Proyecta el crecimiento de tu capital mediante aportaciones periódicas y el rendimiento del interés compuesto a largo plazo.",
      steps: ["Indica la aportación mensual o inicial", "Define la rentabilidad anual esperada y el plazo", "Comprueba el capital final acumulado y los beneficios generados"],
      faqs: [
        { question: "¿Cómo influye el interés compuesto?", answer: "Reinvierte las ganancias generadas en cada periodo para acelerar el crecimiento del capital." },
        { question: "¿Puedo comparar diferentes plazos?", answer: "Sí, puedes ajustar los años para ver el impacto del tiempo en tus ahorros." }
      ]
    },
    pt: {
      name: "Calculadora de Juros Compostos",
      title: "Calculadora de Investimentos e Juros Compostos",
      description: "Simule o rendimento de aportes mensais e o acúmulo de patrimônio com juros compostos ao longo do tempo. 100% gratuita no navegador.",
      intro: "Simule a evolução dos seus investimentos com aportes regulares e a força dos juros compostos ao longo dos anos.",
      steps: ["Digite o valor do investimento inicial ou mensal", "Defina a taxa de retorno anual estimada e o prazo", "Analise o montante final e o total ganho em juros"],
      faqs: [
        { question: "Qual a importância dos aportes constantes?", answer: "Aportes regulares aumentam a base de cálculo para a multiplicação dos juros compostos." },
        { question: "É gratuito para simular?", answer: "Sim, faça quantas simulações quiser sem nenhum custo." }
      ]
    },
    fr: {
      name: "Calculateur d'Intérêts Composés",
      title: "Calculateur d'Épargne et Intérêts Composés",
      description: "Simulez la croissance de votre épargne et de vos investissements réguliers grâce aux intérêts composés. Gratuit et sans publicité.",
      intro: "Visualisez la valorisation de votre patrimoine grâce aux versements réguliers et à l'effet multiplicateur des intérêts composés.",
      steps: ["Indiquez votre versement initial et périodique", "Définissez le taux de rendement annuel espéré et la durée", "Visualisez le capital total accumulé et les gains"],
      faqs: [
        { question: "Pourquoi les intérêts composés sont-ils puissants ?", answer: "Les intérêts de chaque année s'ajoutent au capital et produisent à leur tour des intérêts." },
        { question: "L'outil permet-il de tester plusieurs durées ?", answer: "Oui, vous pouvez faire varier les années pour observer l'effet boule de neige." }
      ]
    },
    de: {
      name: "Zinseszinsrechner & Sparplan",
      title: "Zinseszinsrechner & ETF-Sparplanrechner Kostenlos",
      description: "Berechnen Sie den Vermögensaufbau Ihrer monatlichen Sparraten mit Zinseszinseffekt über beliebige Laufzeiten. Kostenlos und transparent.",
      intro: "Berechnen Sie, wie Ihr Erspartes durch monatliche Sparraten und Zinseszinseffekte über die Jahre kontinuierlich anwächst.",
      steps: ["Startkapital und monatliche Sparrate festlegen", "Erwartete Jahresrendite und Anlagedauer wählen", "Endkapital und Zinserträge auf einen Blick sehen"],
      faqs: [
        { question: "Wie funktioniert der Zinseszinseffekt?", answer: "Erwirtschaftete Zinsen werden reinvestiert und verzinsen sich in den Folgejahren mit." },
        { question: "Ist der Rechner für ETF-Sparpläne geeignet?", answer: "Ja, perfekt zur langfristigen Planung von ETF- und Fonds-Sparplänen." }
      ]
    },
    id: {
      name: "Kalkulator Investasi & Bunga Majemuk",
      title: "Kalkulator Investasi Rutin & Bunga Majemuk",
      description: "Simulasikan pertumbuhan dana tabungan dan investasi berkala Anda menggunakan rumus bunga majemuk. Gratis tanpa perlu mendaftar.",
      intro: "Hitung proyeksi akumulasi dana tabungan atau investasi rutin bulanan Anda berkat efek eksponensial bunga majemuk (compound interest).",
      steps: ["Tentukan modal awal dan nominal setoran rutin bulanan", "Masukkan asumsi imbal hasil tahunan dan jangka waktu", "Lihat total nilai akhir investasi dan keuntungan bersih"],
      faqs: [
        { question: "Mengapa investasi rutin sangat efektif?", answer: "Karena imbal hasil yang diperoleh akan ikut menghasilkan keuntungan tambahan di periode berikutnya." },
        { question: "Apakah bisa untuk simulasi reksa dana atau saham?", answer: "Sangat cocok untuk simulasi reksa dana, emas, maupun instrumen investasi lainnya." }
      ]
    }
  },
  "salary-slip-generator": {
    es: {
      name: "Generador de Recibos de Sueldo",
      title: "Generador de Nóminas y Recibos de Sueldo PDF",
      description: "Genera recibos de sueldo y nóminas detalladas en PDF para empleados con cálculo de retenciones y deducciones. Descarga gratis sin registro.",
      intro: "Crea recibos de sueldo y nóminas mensuales en PDF con desglose de sueldo base, complementos, deducciones e importe neto a percibir.",
      steps: ["Completa los datos de la empresa y del empleado", "Detalla el salario base, pluses y deducciones", "Descarga el recibo de sueldo en PDF"],
      faqs: [
        { question: "¿Calcula el salario neto automáticamente?", answer: "Sí, resta las deducciones del total de devengos para obtener el líquido a percibir." },
        { question: "¿Es adecuado para pequeñas empresas?", answer: "Ideal para pymes, microempresas y autónomos con empleados a cargo." }
      ]
    },
    pt: {
      name: "Gerador de Holerites e Contracheques",
      title: "Gerador de Holerite e Contracheque em PDF Grátis",
      description: "Crie holerites e contracheques profissionais em PDF com proventos, descontos e valor líquido. Rápido, seguro e gratuito no navegador.",
      intro: "Gere demonstrativos de pagamento e holerites em PDF para colaboradores com discriminação de proventos, descontos e salário líquido.",
      steps: ["Insira os dados do empregador e do funcionário", "Preencha o salário base, adicionais e descontos", "Baixe o contracheque em PDF pronto para assinatura"],
      faqs: [
        { question: "O holerite traz os dados obrigatórios?", answer: "Sim, inclui campos para identificação, cargo, período e detalhamento de valores." },
        { question: "É seguro para informações confidenciais?", answer: "Sim, os dados não saem do seu navegador." }
      ]
    },
    fr: {
      name: "Générateur de Fiches de Paie",
      title: "Générateur de Fiche de Paie et Bulletin de Salaire",
      description: "Créez des bulletins de salaire et récapitulatifs de paie en PDF avec détail des primes et déductions. Outil gratuit sans inscription.",
      intro: "Éditez des fiches de paie et récapitulatifs de rémunération clairs en PDF avec détail du salaire brut, des cotisations et du salaire net.",
      steps: ["Renseignez les informations de l'employeur et du salarié", "Ajoutez le salaire de base, les primes et les retenues", "Téléchargez la fiche de paie en PDF"],
      faqs: [
        { question: "Le montant net est-il calculé automatiquement ?", answer: "Oui, la déduction des retenues sur le brut est calculée instantanément." },
        { question: "Peut-on l'imprimer directement ?", answer: "Oui, le PDF est au format A4 standard prêt à l'impression." }
      ]
    },
    de: {
      name: "Gehaltsabrechnung Generator",
      title: "Kostenloser Gehaltsabrechnungs-Generator PDF",
      description: "Erstellen Sie übersichtliche Entgeltabrechnungen als PDF mit Bruttogehalt, Abzügen und Nettobetrag. Privat und kostenlos im Browser.",
      intro: "Erstellen Sie strukturierte Entgeltabrechnungen im PDF-Format mit Ausweis von Grundgehalt, Zulagen, Abzügen und dem Auszahlungsbetrag.",
      steps: ["Arbeitgeber- und Mitarbeiterdaten eintragen", "Grundgehalt, Zuschläge und Abzüge erfassen", "PDF-Gehaltsabrechnung herunterladen"],
      faqs: [
        { question: "Für wen ist das Tool geeignet?", answer: "Für Kleinbetriebe, Gründer und Selbstständige zur übersichtlichen Lohnabrechnung." },
        { question: "Werden Mitarbeiterdaten online gespeichert?", answer: "Nein, alle Eingaben verbleiben lokal in Ihrem Browser." }
      ]
    },
    id: {
      name: "Generator Slip Gaji Karyawan",
      title: "Generator Slip Gaji Karyawan Format PDF Gratis",
      description: "Buat slip gaji karyawan profesional format PDF lengkap dengan rincian tunjangan dan potongan. Cetak gratis tanpa biaya langganan.",
      intro: "Buat slip gaji karyawan usaha format PDF dengan rincian gaji pokok, tunjangan, lembur, dan potongan kasbon/pajak secara otomatis.",
      steps: ["Isi identitas usaha dan data karyawan", "Rincikan gaji pokok, tunjangan, dan potongan", "Unduh file slip gaji PDF yang rapi dan siap cetak"],
      faqs: [
        { question: "Apakah gaji bersih (take home pay) dihitung otomatis?", answer: "Ya, sistem secara otomatis mengurangi total potongan dari total pendapatan." },
        { question: "Apakah bisa menambahkan logo usaha?", answer: "Bisa, logo usaha dapat disematkan di bagian atas slip gaji." }
      ]
    }
  },
  "msmed-interest-calculator": {
    es: {
      name: "Calculadora de Intereses por Demora",
      title: "Calculadora de Intereses de Demora en Facturas",
      description: "Calcula los intereses legales y penalizaciones por impago de facturas comerciales vencidas de tus clientes. Preciso y sin registro.",
      intro: "Calcula los intereses de demora e indemnizaciones legales aplicables a facturas impagadas según los días de retraso en el pago.",
      steps: ["Introduce el importe de la factura vencida", "Indica la fecha de vencimiento y fecha actual", "Obtén el total de intereses acumulados a reclamar"],
      faqs: [
        { question: "¿Cómo se calculan los días de retraso?", answer: "Se cuentan los días naturales transcurridos desde el vencimiento pactado." },
        { question: "¿Puedo adjuntar este cálculo a la reclamación?", answer: "Sí, proporciona el desglose exacto para justificar el recargo por demora." }
      ]
    },
    pt: {
      name: "Calculadora de Juros por Atraso",
      title: "Calculadora de Juros de Mora e Multa por Atraso",
      description: "Calcule juros de mora, multas contratuais e correção monetária para cobrança de faturas e duplicatas vencidas. Grátis no navegador.",
      intro: "Calcule com exatidão a multa por atraso e os juros de mora proporcionais aos dias de inadimplência de cobranças vencidas.",
      steps: ["Informe o valor original da fatura vencida", "Insira a data de vencimento e a data de pagamento", "Confira o valor atualizado com juros e encargos"],
      faqs: [
        { question: "Como são apurados os juros diários?", answer: "A taxa é calculada proporcionalmente (pro-rata die) por dia de atraso." },
        { question: "Serve para renegociação de dívidas?", answer: "Sim, perfeito para apresentar o saldo devedor atualizado ao cliente." }
      ]
    },
    fr: {
      name: "Calculateur d'Intérêts de Retard",
      title: "Calculateur d'Intérêts de Retard et Pénalités",
      description: "Calculez les pénalités de retard et indemnités forfaitaires de recouvrement pour vos factures impayées. Conforme et gratuit.",
      intro: "Déterminez le montant exact des pénalités de retard et des frais de recouvrement légaux à appliquer sur vos créances impayées.",
      steps: ["Saisissez le montant TTC de la facture impayée", "Indiquez la date d'échéance et le taux applicable", "Calculez les pénalités exigibles instantanément"],
      faqs: [
        { question: "L'indemnité forfaitaire de recouvrement est-elle incluse ?", answer: "Oui, vous pouvez ajouter les frais forfaitaires légaux de recouvrement." },
        { question: "L'outil est-il gratuit ?", answer: "Oui, calcul sans frais pour tous vos dossiers clients." }
      ]
    },
    de: {
      name: "Verzugszinsrechner",
      title: "Verzugszinsrechner für Gewerbliche Rechnungen",
      description: "Berechnen Sie gesetzliche Verzugszinsen und Verzugsschäden für überfällige Rechnungen exakt auf den Tag. Kostenlos und rechtssicher.",
      intro: "Berechnen Sie taggenau die gesetzlichen Verzugszinsen und Pauschalen für fällige und unbezahlte Rechnungen gegenüber Kunden.",
      steps: ["Forderungsbetrag und Fälligkeitsdatum eingeben", "Zinssatz oder Basiszinssatz festlegen", "Verzugszinsen und Gesamtforderung ablesen"],
      faqs: [
        { question: "Wie werden die Verzugszinsen berechnet?", answer: "Auf Basis der Verzugstage und des gewählten Jahreszinssatzes." },
        { question: "Gilt der Rechner für B2B-Geschäfte?", answer: "Ja, optimal für gewerbliche Forderungen zwischen Unternehmen." }
      ]
    },
    id: {
      name: "Kalkulator Denda Keterlambatan",
      title: "Kalkulator Denda & Bunga Keterlambatan Tagihan",
      description: "Hitung denda keterlambatan dan bunga penalti atas pembayaran invoice bisnis yang menunggak. Akurat, gratis, dan mudah digunakan.",
      intro: "Hitung besaran denda keterlambatan dan biaya penalti secara harian atau bulanan atas tagihan invoice yang telah lewat jatuh tempo.",
      steps: ["Masukkan jumlah tagihan yang belum dibayar", "Pilih tanggal jatuh tempo dan tanggal penagihan", "Lihat total denda dan jumlah tagihan yang harus dilunasi"],
      faqs: [
        { question: "Bagaimana perhitungan denda keterlambatan dilakukan?", answer: "Dihitung berdasarkan persentase harian/bulanan dikalikan jumlah hari keterlambatan." },
        { question: "Apakah bisa digunakan untuk negosiasi pelunasan?", answer: "Sangat berguna sebagai dasar transparansi saat melakukan penagihan ke klien." }
      ]
    }
  },
  "proforma-invoice-generator": {
    es: {
      name: "Generador de Facturas Proforma",
      title: "Generador de Facturas Proforma en PDF Gratis",
      description: "Crea facturas proforma oficiales en PDF con desglose de productos, condiciones de entrega e importes estimados. Descarga libre sin registro.",
      intro: "Genera facturas proforma profesionales en PDF para formalizar ofertas previas, trámites aduaneros o solicitud de pagos por adelantado.",
      steps: ["Rellena los datos de tu empresa y del comprador", "Añade los artículos, precios y plazos de entrega", "Descarga la factura proforma en PDF lista para enviar"],
      faqs: [
        { question: "¿En qué se diferencia de una factura definitiva?", answer: "La proforma es un documento informativo previo sin validez contable o fiscal hasta la venta final." },
        { question: "¿Es obligatoria para operaciones internacionales?", answer: "Suele exigirse en aduanas y para emitir cartas de crédito bancarias." }
      ]
    },
    pt: {
      name: "Gerador de Faturas Proforma",
      title: "Gerador de Fatura Proforma em PDF Grátis",
      description: "Gere faturas proforma comerciais em PDF para orçamentos e exportações com cálculo automático de valores. Grátis e privado no navegador.",
      intro: "Crie faturas proforma comerciais em formato PDF para formalizar propostas de venda, comércio exterior ou adiantamento de pagamentos.",
      steps: ["Informe os dados do exportador e importador/cliente", "Liste os produtos, quantidades e valores negociados", "Baixe a fatura proforma em PDF instantaneamente"],
      faqs: [
        { question: "Qual a finalidade da fatura proforma?", answer: "Documento preliminar de negociação que antecede a emissão da fatura definitiva." },
        { question: "É aceita para cotações formais?", answer: "Sim, é amplamente utilizada em propostas de compras corporativas." }
      ]
    },
    fr: {
      name: "Générateur de Factures Proforma",
      title: "Générateur de Facture Proforma PDF Gratuit",
      description: "Établissez des factures proforma professionnelles en PDF pour vos transactions et déclarations en douane. Gratuit et sans inscription.",
      intro: "Rédigez des factures proforma complètes en PDF pour valider les conditions de vente avec vos clients ou pour vos démarches d'exportation.",
      steps: ["Indiquez les coordonnées du vendeur et de l'acheteur", "Détaillez les produits, prix et conditions de livraison", "Téléchargez la facture proforma en PDF"],
      faqs: [
        { question: "La facture proforma a-t-elle une valeur comptable ?", answer: "Non, c'est une facture provisoire qui sert de devis formel avant la transaction définitive." },
        { question: "Est-elle adaptée à l'international ?", answer: "Oui, parfaitement conforme pour le commerce international et les douanes." }
      ]
    },
    de: {
      name: "Proforma-Rechnung Generator",
      title: "Kostenloser Proforma-Rechnung Generator PDF",
      description: "Erstellen Sie internationale Proforma-Rechnungen für Zollabwicklung und Vorabkalkulationen als PDF. Ohne Registrierung im Browser.",
      intro: "Erstellen Sie Proforma-Rechnungen im PDF-Format zur Vorabvereinbarung von Lieferungen, Vorkasse-Zahlungen oder für Zollzwecke.",
      steps: ["Angaben zu Verkäufer und Käufer eintragen", "Warenpositionen, Lieferbedingungen und Preise erfassen", "PDF-Proforma-Rechnung herunterladen"],
      faqs: [
        { question: "Wann wird eine Proforma-Rechnung benötigt?", answer: "Typischerweise bei Vorauskasse, Mustersendungen oder für den Zoll beim Export." },
        { question: "Ersetzt sie die spätere Handelsrechnung?", answer: "Nein, nach erfolgter Lieferung muss eine reguläre Rechnung erstellt werden." }
      ]
    },
    id: {
      name: "Generator Faktur Proforma",
      title: "Generator Faktur Proforma Invoice PDF Gratis",
      description: "Buat faktur proforma (proforma invoice) resmi format PDF untuk konfirmasi pesanan dan pengiriman barang. Gratis tanpa syarat login.",
      intro: "Buat faktur proforma (proforma invoice) resmi format PDF sebagai konfirmasi pemesanan barang, syarat uang muka (DP), atau keperluan ekspor.",
      steps: ["Lengkapi data penjual dan pembeli", "Rincikan jenis barang, estimasi biaya, dan syarat pengiriman", "Unduh berkas proforma invoice PDF siap kirim"],
      faqs: [
        { question: "Apa bedanya dengan faktur komersial biasa?", answer: "Faktur proforma adalah penawaran/tagihan sementara sebelum transaksi dan pengiriman barang rampung." },
        { question: "Bisa digunakan untuk permohonan pembayaran uang muka?", answer: "Bisa, sering digunakan sebagai rujukan pembayaran DP atau pelunasan di muka." }
      ]
    }
  },
  "break-even-calculator": {
    es: {
      name: "Calculadora de Punto de Equilibrio",
      title: "Calculadora de Punto de Equilibrio Comercial",
      description: "Determina las ventas y unidades mínimas necesarias para cubrir costes fijos y variables sin pérdidas. Herramienta esencial para negocios.",
      intro: "Calcula el volumen exacto de unidades a vender o los ingresos necesarios para que tu negocio cubra costes y empiece a generar beneficios.",
      steps: ["Introduce los costes fijos mensuales", "Indica el precio de venta unitario y el coste variable por unidad", "Descubre el umbral de rentabilidad y unidades de equilibrio"],
      faqs: [
        { question: "¿Qué es el punto de equilibrio?", answer: "Es el nivel de ventas en el que los ingresos totales igualan exactamente a los costes totales (beneficio cero)." },
        { question: "¿Cómo ayuda a fijar precios?", answer: "Te permite conocer el margen de contribución unitario y la viabilidad del negocio." }
      ]
    },
    pt: {
      name: "Calculadora de Ponto de Equilíbrio",
      title: "Calculadora de Ponto de Equilíbrio e Lucro",
      description: "Descubra o volume mínimo de vendas para cobrir custos fixos e variáveis da sua empresa sem prejuízo. 100% gratuita no navegador.",
      intro: "Descubra quantas unidades ou qual faturamento sua empresa precisa atingir para cobrir todos os custos operacionais e iniciar o lucro.",
      steps: ["Preencha os custos fixos mensais do seu negócio", "Insira o preço de venda unitário e custo variável unitário", "Veja a quantidade mínima de vendas para não ter prejuízo"],
      faqs: [
        { question: "O que indica o ponto de equilíbrio operacional?", answer: "O ponto em que a receita total cobre exatamente as despesas da operação." },
        { question: "É útil no planejamento de novos produtos?", answer: "Essencial para testar a viabilidade econômica antes do lançamento." }
      ]
    },
    fr: {
      name: "Calculateur de Seuil de Rentabilité",
      title: "Calculateur de Seuil de Rentabilité et Point Mort",
      description: "Déterminez le chiffre d'affaires minimum et le volume de ventes nécessaire pour couvrir vos charges fixes et variables. Outil gratuit.",
      intro: "Calculez le chiffre d'affaires et le nombre d'unités indispensables pour couvrir l'intégralité de vos charges fixes et variables.",
      steps: ["Indiquez vos charges fixes totales", "Renseignez le prix de vente unitaire et le coût de revient variable", "Obtenez votre seuil de rentabilité en valeur et en volume"],
      faqs: [
        { question: "Qu'est-ce que la marge sur coût variable ?", answer: "C'est la différence entre le prix de vente et les coûts variables par unité vendue." },
        { question: "Comment trouver le point mort en jours ?", answer: "En divisant le seuil de rentabilité par le chiffre d'affaires quotidien moyen." }
      ]
    },
    de: {
      name: "Break-Even-Rechner",
      title: "Break-Even-Point Rechner & Gewinnschwelle",
      description: "Ermitteln Sie die Gewinnschwelle und die Mindestabsatzmenge zur Deckung Ihrer Fixkosten und variablen Kosten. Kostenlos und neutral.",
      intro: "Berechnen Sie die Gewinnschwelle (Break-Even-Point) Ihres Unternehmens, ab der alle fixen und variablen Kosten vollständig gedeckt sind.",
      steps: ["Fixkosten des Unternehmens eingeben", "Verkaufspreis und variable Stückkosten erfassen", "Erforderliche Stückzahl und Mindestumsatz ablesen"],
      faqs: [
        { question: "Was sagt der Deckungsbeitrag aus?", answer: "Er zeigt den Betrag pro verkaufter Einheit zur Deckung der Fixkosten." },
        { question: "Hilft das bei der Preisgestaltung?", answer: "Ja, Sie erkennen sofort, wie sich Preisänderungen auf die Gewinnschwelle auswirken." }
      ]
    },
    id: {
      name: "Kalkulator Titik Impas BEP",
      title: "Kalkulator Titik Impas BEP Usaha & Bisnis",
      description: "Hitung target penjualan minimal dan volume unit produk untuk mencapai titik impas (Break Even Point) tanpa rugi. Gratis dan akurat.",
      intro: "Hitung target jumlah unit penjualan atau omzet minimum yang harus dicapai agar bisnis Anda balik modal dan mulai meraih laba bersih.",
      steps: ["Masukkan total biaya tetap bulanan operasional", "Tuliskan harga jual per unit dan biaya variabel per produk", "Lihat target titik impas BEP dalam unit dan nilai rupiah"],
      faqs: [
        { question: "Apa arti Break Even Point (BEP)?", answer: "Titik impas di mana total pendapatan sama dengan total biaya sehingga usaha tidak rugi dan belum untung." },
        { question: "Mengapa perhitungan BEP penting untuk usaha?", answer: "Sebagai target penjualan harian/bulanan agar bisnis tidak mengalami defisit." }
      ]
    }
  },
  "treds-calculator": {
    es: {
      name: "Calculadora de Descuento de Facturas",
      title: "Calculadora de Descuento de Facturas y Pagarés",
      description: "Calcula el coste financiero y el valor neto recibido al anticipar o descontar facturas comerciales de clientes. Rápido y gratuito.",
      intro: "Calcula la comisión de descuento, intereses financieros y la liquidez neta obtenida al anticipar el cobro de facturas a crédito.",
      steps: ["Introduce el valor nominal de la factura", "Indica la tasa de descuento anual y los días de anticipo", "Consulta el importe neto recibido y el coste financiero"],
      faqs: [
        { question: "¿Cómo funciona el anticipo de facturas?", answer: "Una entidad financiera adelanta el cobro deduciendo una tasa de descuento por el plazo anticipado." },
        { question: "¿Es útil para gestionar la tesorería?", answer: "Permite convertir ventas a crédito en liquidez inmediata para operar tu negocio." }
      ]
    },
    pt: {
      name: "Calculadora de Antecipação de Recebíveis",
      title: "Calculadora de Antecipação de Recebíveis Grátis",
      description: "Simule taxas de desconto, encargos e o valor líquido a receber na antecipação de faturas e duplicatas da sua empresa. Grátis.",
      intro: "Simule os custos e o valor líquido que sua empresa receberá ao antecipar duplicatas, faturas ou recebíveis a prazo.",
      steps: ["Informe o valor de face do título ou fatura", "Digite a taxa de desconto mensal ou anual e o prazo", "Veja o valor líquido disponível e os custos de antecipação"],
      faqs: [
        { question: "Qual a vantagem de antecipar recebíveis?", answer: "Garante capital de giro imediato sem necessidade de empréstimos tradicionais." },
        { question: "Como são apurados os juros do desconto?", answer: "O desconto é calculado sobre o valor nominal pelo período antecipado." }
      ]
    },
    fr: {
      name: "Calculateur d'Affacturage et Escompte",
      title: "Calculateur d'Affacturage et Escompte de Facture",
      description: "Calculez le coût financier et la trésorerie nette obtenue lors de l'escompte ou du rachat de factures clients. Gratuit et instantané.",
      intro: "Calculez le coût net et la trésorerie immédiate dégagée par l'escompte de vos factures clients ou le recours à l'affacturage.",
      steps: ["Saisissez le montant total de la facture cédée", "Indiquez le taux d'escompte et le délai de paiement restant", "Consultez le montant net viré et les frais financiers"],
      faqs: [
        { question: "Pourquoi recourir à l'escompte ?", answer: "Pour financer rapidement votre trésorerie sans attendre les délais de paiement clients." },
        { question: "La simulation est-elle gratuite ?", answer: "Oui, simulation instantanée et sans engagement." }
      ]
    },
    de: {
      name: "Factoring-Rechner",
      title: "Factoring-Rechner & Forderungsabtretung Kostenlos",
      description: "Berechnen Sie Gebühren, Zinskosten und den Auszahlungsbetrag beim Verkauf oder Vorfinanzieren offener Rechnungen. Kostenlos.",
      intro: "Berechnen Sie Auszahlungsbeträge und Finanzierungskosten beim Factoring und der Vorfinanzierung offener Kundenforderungen.",
      steps: ["Rechnungsbetrag erfassen", "Factoring-Gebühr und Vorfinanzierungszins angeben", "Sofortigen Auszahlungsbetrag ablesen"],
      faqs: [
        { question: "Welchen Vorteil bietet Factoring?", answer: "Sofortige Liquidität und Schutz vor Forderungsausfällen bei langen Zahlungszielen." },
        { question: "Wie berechnen sich die Zinskosten?", answer: "Zinsen fallen tagesgenau für den Zeitraum der Vorfinanzierung an." }
      ]
    },
    id: {
      name: "Kalkulator Anjak Piutang",
      title: "Kalkulator Anjak Piutang & Diskonto Faktur Bisnis",
      description: "Hitung biaya diskonto dan dana tunai bersih yang diterima saat mencairkan piutang faktur sebelum jatuh tempo. Gratis dan akurat.",
      intro: "Simulasikan potongan biaya diskonto dan dana cair bersih yang diperoleh usaha Anda saat mencairkan piutang faktur lebih awal (factoring).",
      steps: ["Masukkan nilai nominal tagihan faktur", "Tentukan tarif diskonto tahunan dan jumlah hari pencairan lebih awal", "Lihat nominal dana bersih yang langsung cair"],
      faqs: [
        { question: "Apa keuntungan anjak piutang (factoring)?", answer: "Menyediakan arus kas tunai cepat untuk modal kerja tanpa menunggu tempo pembayaran klien." },
        { question: "Bagaimana cara hitung diskontonya?", answer: "Dihitung proporsional berdasarkan tenor hari sebelum tanggal jatuh tempo." }
      ]
    }
  },
  "upi-calculator": {
    es: {
      name: "Calculadora de Comisiones de Pago",
      title: "Calculadora de Ahorro en Comisiones de Pago",
      description: "Calcula cuánto dinero ahorra tu negocio al cobrar mediante códigos QR directos frente a terminales con comisiones bancarias. Gratis.",
      intro: "Compara el coste anual de comisiones bancarias por datáfono frente al ahorro de cobrar directamente por transferencia o QR sin intermediarios.",
      steps: ["Introduce tu volumen mensual de ventas", "Indica la comisión media de tu TPV o tarjeta", "Descubre el ahorro anual estimado para tu negocio"],
      faqs: [
        { question: "¿Cuánto cobra habitualmente un TPV?", answer: "Entre el 0.5% y el 2.5% por cada cobro con tarjeta según el banco y volumen." },
        { question: "¿Por qué el cobro por QR directo es más rentable?", answer: "Elimina comisiones fijas por transacción y alquiler mensual de terminales." }
      ]
    },
    pt: {
      name: "Calculadora de Taxas de Cartão",
      title: "Calculadora de Economia em Taxas de Pagamento",
      description: "Descubra quanto sua empresa economiza ao receber por QR Code instantâneo em comparação com taxas de maquininhas de cartão. Grátis.",
      intro: "Compare as taxas de cartão de crédito e maquininhas com a economia de receber pagamentos instantâneos diretos via QR Code.",
      steps: ["Informe seu faturamento mensal aproximado", "Digite a taxa média cobrada pela sua maquininha", "Confira a economia anual gerada para o seu caixa"],
      faqs: [
        { question: "As taxas de maquininha reduzem muito o lucro?", answer: "Sim, podem consumir de 1% a 5% de cada venda no acumulado do mês." },
        { question: "Receber via QR Code direto é mais vantajoso?", answer: "Sim, o dinheiro cai na conta sem descontos de intermediação pesados." }
      ]
    },
    fr: {
      name: "Calculateur de Frais Bancaires et TPE",
      title: "Calculateur d'Économies sur Frais de Paiement",
      description: "Calculez les économies réalisées en acceptant les paiements par QR code direct sans commissions exorbitantes de terminaux bancaires.",
      intro: "Estimez les frais bancaires annuels prélevés par vos terminaux de paiement (TPE) et découvrez le gain financier du paiement direct par QR code.",
      steps: ["Indiquez votre chiffre d'affaires mensuel par carte", "Renseignez le taux de commission moyen de votre TPE", "Visualisez l'économie annuelle réalisée"],
      faqs: [
        { question: "Quel est le coût moyen des commissions TPE ?", answer: "Généralement entre 0,8 % et 2 % par transaction avec carte bancaire." },
        { question: "Le paiement par QR code réduit-il les frais ?", answer: "Oui, les virements directs permettent de conserver une marge maximale." }
      ]
    },
    de: {
      name: "Zahlungsgebühren-Rechner",
      title: "Kostenloser Rechner für Kartengebühren-Ersparnis",
      description: "Berechnen Sie die jährliche Ersparnis durch direkte QR-Zahlungen im Vergleich zu teuren Kartenterminal-Gebühren. Kostenlos im Browser.",
      intro: "Ermitteln Sie die jährlichen Gebührenersparnisse Ihres Geschäfts beim Wechsel von Kartenterminal-Mieten zu direkten QR-Zahlungen.",
      steps: ["Monatlichen Kartenumsatz eingeben", "Durchschnittliche Disagio- und Transaktionsgebühr angeben", "Jährliche Ersparnis für Ihr Gewerbe berechnen"],
      faqs: [
        { question: "Wie hoch sind übliche Terminal-Gebühren?", answer: "Oft 0,9% bis 2,5% pro Bezahlung plus feste Gerätemiete." },
        { question: "Sind direkte QR-Zahlungen gebührenfrei?", answer: "Direkte Überweisungen verursachen in der Regel keine prozentualen Händlerabzüge." }
      ]
    },
    id: {
      name: "Kalkulator Biaya Transaksi Pembayaran",
      title: "Kalkulator Penghematan Biaya Transaksi Usaha",
      description: "Hitung selisih biaya komisi pembayaran QR langsung dibanding mesin gesek kartu EDC perbankan. Gratis, cepat, dan transparan.",
      intro: "Hitung besaran penghematan dana operasional usaha Anda dengan beralih ke pembayaran QR langsung tanpa biaya sewa mesin EDC.",
      steps: ["Masukkan estimasi omzet bulanan toko Anda", "Tentukan persentase biaya transaksi mesin kartu EDC", "Lihat total keuntungan dan penghematan biaya per tahun"],
      faqs: [
        { question: "Berapa potongan rata-rata mesin kartu EDC?", answer: "Biasanya berkisar antara 0,8% hingga 2% untuk setiap kali gesek kartu." },
        { question: "Mengapa QR code langsung lebih menguntungkan?", answer: "Uang langsung masuk rekening tanpa biaya sewa bulanan perangkat keras." }
      ]
    }
  },
  "offer-poster-generator": {
    es: {
      name: "Generador de Carteles de Ofertas",
      title: "Generador de Carteles de Ofertas y Descuentos",
      description: "Diseña carteles promocionales atractivos con descuentos y códigos QR listos para imprimir en tu tienda o restaurante. 100% gratis.",
      intro: "Crea carteles publicitarios y pósteres de ofertas especiales con códigos QR para llamar la atención de tus clientes en el punto de venta.",
      steps: ["Introduce el título de la oferta y porcentaje de descuento", "Añade tu código QR o enlace promocional", "Descarga el cartel en alta resolución para imprimir"],
      faqs: [
        { question: "¿Qué formatos de impresión están disponibles?", answer: "Tamaños estándar listos para imprimir en formato A4 y póster." },
        { question: "¿Puedo incluir mis colores de marca?", answer: "Sí, puedes personalizar los colores y tipografías destacadas." }
      ]
    },
    pt: {
      name: "Gerador de Cartazes de Ofertas",
      title: "Gerador de Cartazes de Ofertas e Promoções",
      description: "Crie cartazes promocionais atraentes com descontos e QR Code prontos para impressão no seu ponto de venda. Grátis e sem cadastro.",
      intro: "Gere cartazes promocionais chamativos com ofertas, descontos e QR Code para expor na vitrine ou balcão do seu comércio.",
      steps: ["Escreva o título da promoção e o desconto oferecido", "Insira seu QR Code para mais informações ou pagamento", "Baixe a arte pronta em alta resolução para impressão"],
      faqs: [
        { question: "A imagem fica nítida na impressão?", answer: "Sim, arquivo em alta definição preparado para folhas A4 e banners." },
        { question: "É gratuito para criar cartazes?", answer: "100% grátis e sem marcas d'água nas suas artes." }
      ]
    },
    fr: {
      name: "Générateur d'Affiches Promotionnelles",
      title: "Générateur d'Affiches de Promo avec QR Code",
      description: "Concevez des affiches de promotions et réductions attractives avec QR code prêtes à imprimer pour votre commerce. Gratuit et simple.",
      intro: "Créez des affiches promotionnelles percutantes avec vos offres spéciales et un QR code pour guider les clients vers votre boutique ou menu.",
      steps: ["Renseignez le titre de la promotion et le taux de réduction", "Ajoutez votre QR code promotionnel", "Téléchargez l'affiche haute définition prête à imprimer"],
      faqs: [
        { question: "Quels formats d'affiches sont générés ?", answer: "Formats A4 optimisés pour vitrines et chevalets." },
        { question: "Peut-on personnaliser le design ?", answer: "Oui, textes et visuels sont ajustables pour correspondre à votre enseigne." }
      ]
    },
    de: {
      name: "Angebotsplakat Generator",
      title: "Werbeplakat & Angebotsplakat Generator Kostenlos",
      description: "Erstellen Sie aufmerksamkeitsstarke Aktionsplakate mit Rabatten und QR-Codes für Ladenfenster und Theken. Direkt als PDF/PNG druckbar.",
      intro: "Erstellen Sie ansprechende Aktions- und Rabattplakate mit QR-Codes für Ihre Schaufenster, Kundenstopper und Ladentheken.",
      steps: ["Aktionstitel und Rabatthöhe festlegen", "QR-Code für Details oder Bezahlung einfügen", "Druckfertiges Plakat herunterladen"],
      faqs: [
        { question: "Eignet sich die Datei für den Posterdruck?", answer: "Ja, die Grafiken werden in hoher Druckauflösung generiert." },
        { question: "Müssen Lizenzgebühren gezahlt werden?", answer: "Nein, alle erstellten Plakate sind frei für kommerzielle Nutzung." }
      ]
    },
    id: {
      name: "Generator Poster Promo",
      title: "Generator Poster Promo & Diskon Toko Siap Cetak",
      description: "Desain poster promosi diskon menarik dengan QR Code siap cetak untuk etalase toko dan resto Anda. Gratis tanpa watermark.",
      intro: "Rancang poster promo diskon dan penawaran spesial menarik yang dilengkapi kode QR untuk dipasang di etalase toko atau kasir.",
      steps: ["Tuliskan judul promo dan persentase potongan harga", "Sematkan kode QR toko atau katalog produk", "Unduh gambar poster resolusi tinggi siap cetak"],
      faqs: [
        { question: "Apakah hasil cetak tajam untuk ukuran A4?", answer: "Ya, dirancang khusus dengan resolusi tinggi agar tidak pecah saat dicetak." },
        { question: "Apakah ada biaya atau watermark?", answer: "Gratis tanpa watermark sehingga terlihat sangat profesional." }
      ]
    }
  },
  "menu-qr-generator": {
    es: {
      name: "Generador de Menú QR",
      title: "Generador de Códigos QR para Menús de Restaurante",
      description: "Crea códigos QR elegantes para la carta digital de tu restaurante, bar o cafetería sin necesidad de aplicaciones adicionales. Gratis.",
      intro: "Genera códigos QR limpios y duraderos que llevan directamente a la carta digital de tu restaurante, bar o cafetería.",
      steps: ["Introduce el enlace de tu menú online o PDF", "Personaliza el marco y diseño del código", "Descarga el QR listo para colocar en mesas o barra"],
      faqs: [
        { question: "¿Los clientes necesitan descargar una app para leer el menú?", answer: "No, la cámara del móvil abre la carta al instante." },
        { question: "¿Puedo cambiar el menú sin reimprimir el QR?", answer: "Si enlazas a una URL o usas QR dinámico, sí." }
      ]
    },
    pt: {
      name: "Gerador de Cardápio QR",
      title: "Gerador de Cardápio Digital QR Code para Bares",
      description: "Gere QR Codes elegantes para o menu digital do seu restaurante, lanchonete ou bar. Prontos para colocar nas mesas, 100% gratuito.",
      intro: "Crie QR Codes profissionais para o cardápio online do seu restaurante, pizzaria ou bar, prontos para impressão em displays de mesa.",
      steps: ["Insira o link do seu cardápio digital ou PDF", "Escolha a moldura e cores de exibição", "Baixe a arte pronta para colocar nas mesas"],
      faqs: [
        { question: "Funciona com cardápios em PDF?", answer: "Sim, basta inserir o link público do seu arquivo PDF ou página web." },
        { question: "Fica fácil dos clientes escanearem?", answer: "Sim, código otimizado para leitura rápida mesmo em locais com pouca luz." }
      ]
    },
    fr: {
      name: "Générateur de Menu QR",
      title: "Générateur de Menu QR Code pour Restaurant",
      description: "Créez des QR codes élégants pour la carte et le menu de votre restaurant ou café. Idéal pour chevalets de table, gratuit et instantané.",
      intro: "Générez des QR codes soignés pour permettre à vos clients de consulter instantanément la carte de votre établissement sur leur smartphone.",
      steps: ["Indiquez le lien de votre menu en ligne ou carte PDF", "Personnalisez la présentation et le texte d'incitation", "Téléchargez le visuel prêt pour vos chevalets de table"],
      faqs: [
        { question: "Les clients doivent-ils télécharger une application ?", answer: "Non, l'appareil photo du smartphone suffit pour ouvrir le menu." },
        { question: "L'outil est-il adapté aux bars et cafés ?", answer: "Parfaitement adapté à la restauration, brasseries et salons de thé." }
      ]
    },
    de: {
      name: "Speisekarten QR-Generator",
      title: "QR-Code Generator für Digitale Speisekarten",
      description: "Erstellen Sie stilvolle QR-Codes für digitale Speisekarten in Restaurants und Cafés. Druckfertig für Tischaufsteller und kostenlos.",
      intro: "Erstellen Sie elegante QR-Codes für digitale Menüs und Getränkekarten in Restaurants, Bistros und Cafés.",
      steps: ["Link zur Online-Speisekarte oder PDF einfügen", "Design und Rahmen nach Wunsch anpassen", "Druckfertigen QR-Code für Tischaufsteller herunterladen"],
      faqs: [
        { question: "Müssen Gäste eine App installieren?", answer: "Nein, das Menü öffnet sich direkt im mobilen Browser des Gastes." },
        { question: "Kann man den Code für Tischaufsteller nutzen?", answer: "Ja, die Vorlage ist für alle gängigen Tischkarten-Formate optimiert." }
      ]
    },
    id: {
      name: "Generator Menu QR",
      title: "Generator QR Code Menu Restoran & Kafe Gratis",
      description: "Buat QR Code menu digital untuk restoran, kafe, dan kedai kopi Anda. Siap dipajang di meja makan, gratis tanpa biaya langganan.",
      intro: "Buat kode QR khusus menu makanan dan minuman digital untuk kafe, warung makan, dan restoran Anda agar pelanggan mudah memesan dari meja.",
      steps: ["Masukkan link menu online atau link file PDF menu Anda", "Sesuaikan bingkai dan teks ajakan scan", "Unduh gambar QR Code siap cetak untuk tenda meja"],
      faqs: [
        { question: "Apakah pelanggan perlu install aplikasi?", answer: "Tidak perlu. Kamera HP akan langsung membuka menu makanan seketika." },
        { question: "Apakah bisa untuk menu di Google Drive?", answer: "Bisa, cukup salin dan tempelkan link publik Google Drive Anda." }
      ]
    }
  },
  "margin-calculator": {
    es: {
      name: "Calculadora de Margen de Beneficio",
      title: "Calculadora de Margen Comercial y Ganancia Gratis",
      description: "Calcula el margen de beneficio, porcentaje de recargo (markup) y precio de venta óptimo para tus productos y servicios al instante.",
      intro: "Calcula con precisión el margen bruto, margen neto y el porcentaje de recargo para fijar precios rentables en tus productos y servicios.",
      steps: ["Introduce el coste de adquisición del producto", "Indica el margen de beneficio o recargo deseado", "Obtén el precio de venta recomendado y el beneficio bruto"],
      faqs: [
        { question: "¿Cuál es la diferencia entre margen y recargo (markup)?", answer: "El margen es el porcentaje sobre el precio de venta; el recargo es el porcentaje sobre el coste." },
        { question: "¿Ayuda a evitar vender a pérdidas?", answer: "Sí, garantiza que cubras tus costes y asegures la rentabilidad de cada venta." }
      ]
    },
    pt: {
      name: "Calculadora de Margem de Lucro",
      title: "Calculadora de Margem de Lucro e Markup Grátis",
      description: "Calcule a margem de lucro bruta, líquida e o markup de precificação ideal para os produtos do seu negócio. Simples e gratuita.",
      intro: "Calcule a margem de lucro e o markup de precificação para estabelecer preços justos e lucrativos para as mercadorias da sua loja.",
      steps: ["Insira o custo de compra do produto", "Defina a margem de lucro ou markup desejado", "Veja o preço de venda final e o lucro estimado por unidade"],
      faqs: [
        { question: "Qual a diferença entre margem de lucro e markup?", answer: "Markup é a porcentagem sobre o custo; margem de lucro é a porcentagem sobre o preço de venda." },
        { question: "A ferramenta é precisa para o comércio?", answer: "Sim, essencial para precificação correta de produtos no varejo e atacado." }
      ]
    },
    fr: {
      name: "Calculateur de Marge Commerciale",
      title: "Calculateur de Marge Commerciale et Taux de Marque",
      description: "Calculez le taux de marge, le taux de marque et le prix de vente idéal pour vos produits en quelques secondes. Gratuit et sans pub.",
      intro: "Calculez facilement votre marge brute, votre taux de marque et votre taux de marge pour définir les prix de vente les plus rentables.",
      steps: ["Saisissez le coût d'achat hors taxes du produit", "Indiquez le taux de marge ou le prix de vente visé", "Consultez la marge brute et le taux de marque obtenus"],
      faqs: [
        { question: "Quelle est la différence entre taux de marge et taux de marque ?", answer: "Le taux de marge s'applique sur le coût d'achat, le taux de marque sur le prix de vente." },
        { question: "Est-ce adapté pour le commerce de détail ?", answer: "Indispensable pour fixer les prix de vente en boutique et e-commerce." }
      ]
    },
    de: {
      name: "Handelsspannenrechner",
      title: "Margenrechner & Handelsspannenrechner Kostenlos",
      description: "Berechnen Sie Gewinnmargen, Rohertrag und Verkaufspreise für Ihre Produkte und Dienstleistungen im Handumdrehen. Kostenlos im Browser.",
      intro: "Berechnen Sie Handelsspanne, Aufschlagssatz und den optimalen Verkaufspreis für Ihre Waren und Dienstleistungen.",
      steps: ["Einkaufspreis / Herstellkosten eingeben", "Gewünschte Marge oder Aufschlag in Prozent festlegen", "Verkaufspreis und Rohgewinn sofort ablesen"],
      faqs: [
        { question: "Was unterscheidet Marge und Kalkulationsaufschlag?", answer: "Die Marge bezieht sich auf den Verkaufspreis, der Aufschlag auf den Einkaufspreis." },
        { question: "Hilft das Tool bei der Preisfindung?", answer: "Ja, Sie finden schnell den optimalen Verkaufspreis zur Erreichung Ihrer Gewinnziele." }
      ]
    },
    id: {
      name: "Kalkulator Margin Keuntungan",
      title: "Kalkulator Margin Keuntungan & Markup Harga Jual",
      description: "Hitung margin laba kotor, persentase markup, dan tentukan harga jual produk usaha secara tepat. Praktis, akurat, dan gratis.",
      intro: "Hitung margin laba kotor dan persentase markup harga jual untuk menentukan harga produk yang tepat dan menghasilkan keuntungan optimal.",
      steps: ["Masukkan harga modal (HPP) produk Anda", "Tentukan target persentase margin keuntungan yang diinginkan", "Dapatkan rekomendasi harga jual dan laba kotor per unit"],
      faqs: [
        { question: "Apa bedanya margin dan markup?", answer: "Markup dihitung berdasarkan persentase dari modal; margin adalah persentase laba dari harga jual akhir." },
        { question: "Apakah cocok untuk toko kelontong dan online shop?", answer: "Sangat cocok untuk pedagang eceran, UMKM, dan pemilik olshop." }
      ]
    }
  },
  "upi-limits": {
    es: {
      name: "Comprobador de Límites de Transferencia",
      title: "Comprobador de Límites de Transferencia Bancaria",
      description: "Consulta los límites diarios y por transacción para pagos digitales y transferencias inmediatas entre cuentas. Información actualizada.",
      intro: "Consulta los límites máximos diarios y por operación para pagos digitales inmediatos según las principales entidades bancarias.",
      steps: ["Selecciona tu entidad bancaria o método de pago", "Verifica el límite por transacción y límite diario acumulado", "Consulta los plazos de liquidación y normativas"],
      faqs: [
        { question: "¿Los límites aplican a usuarios particulares y empresas?", answer: "Los comercios verificados suelen contar con límites ampliados o sin tope fijo." },
        { question: "¿Se actualiza periódicamente la información?", answer: "Sí, reflejamos las últimas normativas bancarias publicadas." }
      ]
    },
    pt: {
      name: "Verificador de Limites de Transferência",
      title: "Verificador de Limites de Transferência Bancária",
      description: "Consulte os limites diários e por operação para transferências instantâneas e pagamentos eletrônicos. Consulta rápida e gratuita.",
      intro: "Verifique os limites de valores permitidos para transferências instantâneas diárias e noturnas entre instituições financeiras.",
      steps: ["Escolha o tipo de conta ou instituição", "Veja o limite permitido por operação e por dia", "Confira as regras para aumento de limite"],
      faqs: [
        { question: "Os limites noturnos são diferentes?", answer: "Muitas instituições reduzem limites no período noturno por motivos de segurança." },
        { question: "Como aumentar meu limite diário?", answer: "A solicitação deve ser feita diretamente no aplicativo do seu banco." }
      ]
    },
    fr: {
      name: "Vérificateur de Plafonds de Virement",
      title: "Vérificateur de Plafonds de Virement et Paiement",
      description: "Vérifiez les plafonds journaliers et montants maximaux autorisés pour vos virements instantanés et paiements. Guide gratuit et clair.",
      intro: "Renseignez-vous sur les plafonds de paiement et de virement instantané appliqués par les établissements financiers pour sécuriser vos transferts.",
      steps: ["Sélectionnez le type d'opération ou établissement", "Consultez les plafonds journaliers et par opération", "Découvrez les conditions pour relever vos plafonds"],
      faqs: [
        { question: "Les plafonds professionnels sont-ils plus élevés ?", answer: "Oui, les comptes professionnels bénéficient de plafonds rehaussés." },
        { question: "Comment débloquer un plafond ponctuel ?", answer: "En contactant votre conseiller bancaire ou via l'espace client en ligne." }
      ]
    },
    de: {
      name: "Überweisungslimit Prüfer",
      title: "Überweisungslimit & Tageslimit Ratgeber Kostenlos",
      description: "Informieren Sie sich über tägliche Höchstbeträge und Limits für Sofortüberweisungen und digitale Zahlungen. Übersichtlich und gratis.",
      intro: "Prüfen Sie maximale Überweisungslimits und Tagesgrenzen für Sofortüberweisungen und digitale Transaktionen im Bankverkehr.",
      steps: ["Überweisungsart oder Institut auswählen", "Tages- und Einzeltransaktionslimit prüfen", "Hinweise zur Limiterhöhung beachten"],
      faqs: [
        { question: "Kann das Überweisungslimit angepasst werden?", answer: "Ja, im Online-Banking lässt sich das Tageslimit meist flexibel anpassen." },
        { question: "Gibt es Limits für Echtzeitüberweisungen?", answer: "Ja, für Sofortüberweisungen gelten gesonderte Obergrenzen pro Buchung." }
      ]
    },
    id: {
      name: "Pengecek Batas Transfer Harian",
      title: "Pengecek Batas Transfer & Transaksi Digital Harian",
      description: "Ketahui batas nominal transfer harian dan limit transaksi pembayaran digital antar bank secara praktis. Gratis tanpa perlu registrasi.",
      intro: "Ketahui batas nominal maksimal transfer harian dan batas transaksi pembayaran digital antar bank untuk kelancaran transaksi usaha Anda.",
      steps: ["Pilih jenis rekening atau kanal transfer yang digunakan", "Cek nominal limit per transaksi dan batas harian maksimal", "Baca tips menaikkan limit transaksi bisnis Anda"],
      faqs: [
        { question: "Apakah limit akun bisnis lebih besar dibanding akun personal?", answer: "Ya, akun merchant/bisnis umumnya memiliki limit transaksi harian jauh lebih tinggi." },
        { question: "Bagaimana cara menaikkan batas transfer harian?", answer: "Dapat diajukan melalui menu pengaturan aplikasi perbankan atau mendatangi kantor cabang bank." }
      ]
    }
  },
  "upi-qr-decoder": {
    es: {
      name: "Decodificador de Códigos QR",
      title: "Decodificador y Lector de Códigos QR Gratis",
      description: "Sube una imagen con un código QR o usa tu cámara para leer y extraer el enlace o texto sin descargar aplicaciones. Privado y seguro.",
      intro: "Extrae el contenido de cualquier código QR subiendo una imagen o usando tu cámara web sin instalar aplicaciones externas.",
      steps: ["Sube la imagen del código QR o activa la cámara", "El sistema decodifica el contenido al instante", "Copia el enlace, datos de pago o texto extraído"],
      faqs: [
        { question: "¿Puedo leer códigos QR desde el ordenador?", answer: "Sí, puedes subir archivos JPG, PNG o WebP guardados en tu equipo." },
        { question: "¿Es seguro decodificar enlaces aquí?", answer: "La decodificación se ejecuta en tu navegador para proteger tu privacidad." }
      ]
    },
    pt: {
      name: "Decodificador de QR Code",
      title: "Leitor e Decodificador de QR Code Online Grátis",
      description: "Envie uma imagem ou leia códigos QR diretamente pela câmera para extrair links e dados em texto. Seguro, rápido e gratuito no navegador.",
      intro: "Descubra o conteúdo de qualquer QR Code fazendo o upload de uma imagem ou utilizando a câmera do seu dispositivo sem instalar nada.",
      steps: ["Faça upload da imagem do QR Code ou aponte a câmera", "Aguarde a decodificação imediata", "Copie o texto, link ou chave extraída"],
      faqs: [
        { question: "Funciona com prints de tela?", answer: "Sim, aceita capturas de tela e fotos de boa qualidade." },
        { question: "É seguro escanear códigos aqui?", answer: "Sim, todo o processamento da imagem acontece no seu próprio navegador." }
      ]
    },
    fr: {
      name: "Décodeur de QR Code",
      title: "Décodeur et Lecteur de QR Code en Ligne Gratuit",
      description: "Scannez ou importez une image de code QR pour extraire instantanément le texte et lien caché sans installer d'application tierce.",
      intro: "Analysez et décodez instantanément n'importe quel code QR à partir d'une image ou via votre webcam sans aucune installation.",
      steps: ["Importez votre image QR code ou utilisez la webcam", "Le contenu est décodé automatiquement en quelques millisecondes", "Copiez le lien ou les données extraites"],
      faqs: [
        { question: "Puis-je analyser une capture d'écran ?", answer: "Oui, les formats PNG, JPG et WebP sont entièrement pris en charge." },
        { question: "Mes images sont-elles téléversées sur un serveur ?", answer: "Non, l'analyse se fait localement dans le navigateur pour garantir votre confidentialité." }
      ]
    },
    de: {
      name: "QR-Code Decoder",
      title: "Kostenloser QR-Code Decoder & Online-Leser",
      description: "Laden Sie ein QR-Code Bild hoch oder nutzen Sie die Kamera, um enthaltene Links und Daten zu decodieren. Sicher und lokal im Browser.",
      intro: "Entschlüsseln und lesen Sie QR-Codes direkt aus Bilddateien oder über die Webcam aus, ohne zusätzliche Software installieren zu müssen.",
      steps: ["QR-Code Bild hochladen oder Kamera aktivieren", "Inhalt wird sofort entschlüsselt", "Gefundene URL oder Textnachricht kopieren"],
      faqs: [
        { question: "Können Screenshots von QR-Codes gelesen werden?", answer: "Ja, Screenshots und Fotos in gängigen Formaten werden unterstützt." },
        { question: "Werden Bilder auf Server übertragen?", answer: "Nein, die Entschlüsselung erfolgt vollständig lokal auf Ihrem Rechner." }
      ]
    },
    id: {
      name: "Dekoder QR Code Online",
      title: "Pembaca & Dekoder Gambar QR Code Online Gratis",
      description: "Unggah gambar atau gunakan kamera untuk membaca dan mengekstrak isi tautan atau teks kode QR secara instan. Cepat, privat, dan gratis.",
      intro: "Ekstrak dan baca isi dari gambar kode QR secara instan dengan mengunggah foto atau menggunakan kamera tanpa perlu menginstal aplikasi.",
      steps: ["Unggah gambar QR Code atau aktifkan kamera", "Sistem akan membaca isi kode QR secara otomatis", "Salin teks, tautan, atau data transaksi yang ditemukan"],
      faqs: [
        { question: "Bisakah membaca screenshot QR dari galeri HP?", answer: "Bisa, Anda cukup mengunggah file screenshot dari galeri perangkat Anda." },
        { question: "Apakah data saya aman?", answer: "Sangat aman karena gambar diproses langsung di peramban tanpa diunggah ke server mana pun." }
      ]
    }
  },
  "upi-link-generator": {
    es: {
      name: "Generador de Enlaces de Pago",
      title: "Generador de Enlaces de Pago Directo Gratis",
      description: "Crea enlaces de pago personalizados con importe fijo y nota para enviar a tus clientes por chat o redes sociales. Gratis y sin comisiones.",
      intro: "Genera enlaces directos de cobro con importe y concepto para compartir por WhatsApp, correo o redes sociales sin intermediarios.",
      steps: ["Introduce tu identificador de cobro y nombre", "Añade el importe y motivo del cobro opcional", "Copia el enlace de pago directo para compartir"],
      faqs: [
        { question: "¿Cómo abre el cliente el enlace de pago?", answer: "Al hacer clic en el móvil, se abre automáticamente la aplicación de pago compatible." },
        { question: "¿Hay comisiones por generar enlaces?", answer: "No, la herramienta es totalmente gratuita y sin comisiones." }
      ]
    },
    pt: {
      name: "Gerador de Links de Pagamento",
      title: "Gerador de Links de Pagamento Direto Grátis",
      description: "Gere links de pagamento com valor e descrição personalizada para enviar por WhatsApp ou redes sociais. Rápido, sem taxas e gratuito.",
      intro: "Crie links de cobrança direta com valor definido e descrição para enviar a clientes por WhatsApp, e-mail ou redes sociais.",
      steps: ["Insira sua identificação de recebimento ou chave", "Defina o valor e a descrição da cobrança", "Copie o link direto gerado e envie ao cliente"],
      faqs: [
        { question: "O cliente consegue pagar pelo celular em um clique?", answer: "Sim, o link direciona para o aplicativo de pagamento suportado." },
        { question: "Cobram mensalidade ou taxa de serviço?", answer: "Não, ferramenta 100% gratuita para autônomos e comerciantes." }
      ]
    },
    fr: {
      name: "Générateur de Liens de Paiement",
      title: "Générateur de Lien de Paiement Direct Gratuit",
      description: "Créez des liens de paiement personnalisés avec montant et libellé à partager par message ou e-mail. 100% gratuit et sans commission.",
      intro: "Générez des liens de paiement directs avec montant prédéfini et motif de transaction pour vous faire payer rapidement par message.",
      steps: ["Renseignez votre identifiant de compte et nom commercial", "Indiquez le montant à régler et le libellé", "Partagez le lien de paiement avec votre débiteur"],
      faqs: [
        { question: "Comment le payeur règle-t-il la somme ?", answer: "En cliquant sur le lien depuis son smartphone pour ouvrir l'application de règlement." },
        { question: "Y a-t-il des frais sur les transactions ?", answer: "Aucun frais prélevé par notre plateforme." }
      ]
    },
    de: {
      name: "Zahlungslink Generator",
      title: "Kostenloser Generator für Direkte Zahlungslinks",
      description: "Erstellen Sie persönliche Zahlungslinks mit Betrag und Verwendungszweck zum Teilen per Chat und Mail. Provisionsfrei und kostenlos.",
      intro: "Erstellen Sie direkte Zahlungs-Links mit festem Betrag und Verwendungszweck zum bequemen Teilen per WhatsApp, SMS oder E-Mail.",
      steps: ["Empfängerkennung und Händlername eingeben", "Betrag und Verwendungszweck festlegen", "Zahlungslink kopieren und an Kunden senden"],
      faqs: [
        { question: "Wie führt der Kunde die Zahlung aus?", answer: "Ein Klick auf dem Smartphone öffnet direkt die passende Zahlungs-App." },
        { question: "Gibt es versteckte Gebühren?", answer: "Nein, das Tool ist komplett kostenfrei und provisionsfrei." }
      ]
    },
    id: {
      name: "Generator Tautan Pembayaran",
      title: "Generator Tautan Link Pembayaran Cepat Gratis",
      description: "Buat tautan pembayaran kustom dengan nominal dan catatan untuk dibagikan via chat WhatsApp ke pelanggan. Gratis tanpa potongan fee.",
      intro: "Buat tautan pembayaran langsung lengkap dengan nominal tagihan dan catatan transaksi untuk dibagikan ke pelanggan via WhatsApp atau SMS.",
      steps: ["Masukkan nomor rekening atau ID penerima dana", "Tentukan nominal tagihan dan catatan pembayaran", "Salin link pembayaran dan kirimkan ke pembeli"],
      faqs: [
        { question: "Bagaimana cara pembeli membayar?", answer: "Pembeli cukup mengklik tautan di ponsel untuk membuka aplikasi pembayaran secara otomatis." },
        { question: "Apakah dikenakan biaya per pembuatan link?", answer: "Sama sekali tidak ada biaya alias 100% gratis." }
      ]
    }
  },
  "survey-qr-generator": {
    es: {
      name: "Generador de QR para Encuestas",
      title: "Generador de Códigos QR para Encuestas y Reseñas",
      description: "Crea códigos QR directos hacia formularios de Google, Typeform o encuestas de satisfacción para conseguir opiniones de clientes de inmediato.",
      intro: "Genera códigos QR llamativos que dirigen a tus clientes a encuestas de satisfacción, formularios de Google o páginas de reseñas en Google Maps.",
      steps: ["Pega el enlace de tu encuesta o ficha de Google Maps", "Personaliza el marco con una llamada a la acción atractiva", "Descarga e imprime el QR para colocar en tu mostrador"],
      faqs: [
        { question: "¿Sirve para conseguir más reseñas en Google Maps?", answer: "Sí, es perfecto para colocar en mesas o caja y conseguir valoraciones de clientes." },
        { question: "¿Funciona con cualquier plataforma de encuestas?", answer: "Compatible con Google Forms, Typeform, SurveyMonkey y cualquier enlace web." }
      ]
    },
    pt: {
      name: "Gerador de QR para Pesquisas",
      title: "Gerador de QR Code para Pesquisas e Avaliações",
      description: "Gere QR Codes rápidos para Google Forms e formulários de avaliação de clientes no seu estabelecimento. Fácil de usar e 100% gratuito.",
      intro: "Crie códigos QR para formulários de satisfação, pesquisas de opinião e avaliações do Google Meu Negócio no seu ponto de atendimento.",
      steps: ["Insira o link do formulário ou página de avaliação", "Personalize o texto de chamada para incentivar respostas", "Baixe a arte pronta para imprimir e fixar no local"],
      faqs: [
        { question: "Ajuda a aumentar avaliações 5 estrelas no Google?", answer: "Sim, facilita para o cliente avaliar diretamente do celular no momento do consumo." },
        { question: "Funciona com Google Forms e outros links?", answer: "Sim, aceita qualquer endereço web de pesquisa ou formulário." }
      ]
    },
    fr: {
      name: "Générateur de QR pour Enquêtes",
      title: "Générateur de QR Code pour Sondages et Avis",
      description: "Générez des QR codes pointant vers vos formulaires Google Forms ou enquêtes de satisfaction client en magasin. Gratuit et instantané.",
      intro: "Créez des QR codes pratiques pour collecter les avis clients sur Google ou les réponses à vos questionnaires de satisfaction directement sur place.",
      steps: ["Collez le lien de votre formulaire ou profil d'avis", "Ajoutez un message d'incitation clair", "Téléchargez et imprimez le QR code pour votre comptoir"],
      faqs: [
        { question: "Est-ce efficace pour récolter des avis Google ?", answer: "Très efficace car le client scanne le code directement depuis son smartphone sur place." },
        { question: "Peut-on l'utiliser avec Google Forms et Typeform ?", answer: "Oui, compatible avec n'importe quelle plateforme de sondage en ligne." }
      ]
    },
    de: {
      name: "Umfrage QR-Code Generator",
      title: "QR-Code Generator für Kundenumfragen & Feedback",
      description: "Erstellen Sie QR-Codes für Google Forms und Feedback-Bögen, um Kundenbewertungen direkt vor Ort zu sammeln. Kostenlos und werbefrei.",
      intro: "Generieren Sie auffällige QR-Codes für Feedback-Formulare, Google-Bewertungen und Kundenumfragen direkt am Verkaufsort.",
      steps: ["Link zum Umfrageformular oder Google-Unternehmensprofil einfügen", "Handlungsaufforderung hinzufügen", "QR-Code drucken und an Kasse oder Tischen platzieren"],
      faqs: [
        { question: "Kann man damit Google-Bewertungen steigern?", answer: "Ja, Kunden gelangen per Scan direkt zur Bewertungsseite Ihres Betriebs." },
        { question: "Funktioniert das mit allen Umfrage-Tools?", answer: "Ja, kompatibel mit Google Forms, Microsoft Forms und allen Weblinks." }
      ]
    },
    id: {
      name: "Generator QR Survei & Ulasan",
      title: "Generator QR Code Survei Pelanggan & Kuesioner",
      description: "Buat QR Code cepat menuju Google Form atau tautan kuesioner ulasan kepuasan pelanggan toko. Praktis, siap cetak, dan gratis.",
      intro: "Buat QR Code praktis yang mengarahkan pembeli ke kuesioner Google Form atau halaman ulasan Google Bisnis untuk mengumpulkan feedback kepuasan.",
      steps: ["Tempelkan tautan Google Form atau link ulasan Google Maps", "Tambahkan kalimat ajakan yang ramah", "Unduh gambar QR Code siap cetak di meja kasir"],
      faqs: [
        { question: "Apakah bisa untuk meningkatkan rating Google Maps toko?", answer: "Bisa, pembeli tinggal scan di tempat untuk langsung memberi ulasan bintang 5." },
        { question: "Apakah bisa untuk Google Form kuesioner?", answer: "Sangat bisa, tinggal masukkan link kuesioner Anda." }
      ]
    }
  },
  "generator": {
    es: {
      name: "Generador de Códigos QR Estándar",
      title: "Generador de Códigos QR para Pagos y Enlaces",
      description: "Genera códigos QR de alta resolución para enlaces, redes sociales y transferencias directas con descarga instantánea en PNG. Gratis.",
      intro: "Herramienta universal y rápida para generar códigos QR de alta calidad para enlaces web, datos de pago y textos comerciales.",
      steps: ["Introduce los datos que deseas codificar", "Personaliza el tamaño y descarga la imagen", "Imprime o comparte tu código QR"],
      faqs: [
        { question: "¿El código QR expira en algún momento?", answer: "No, los códigos QR estáticos funcionan para siempre sin caducidad." },
        { question: "¿La descarga es gratuita?", answer: "Sí, descarga ilimitada en formato PNG sin marcas de agua." }
      ]
    },
    pt: {
      name: "Gerador de QR Code Padrão",
      title: "Gerador de QR Code para Pagamentos e Links Grátis",
      description: "Gere códigos QR em alta definição para links, pagamentos e redes sociais com download imediato em PNG. Rápido, privado e gratuito.",
      intro: "Gerador universal de QR Code para criar códigos de alta resolução para links, redes sociais e recebimentos sem custos.",
      steps: ["Digite o texto, link ou dado a codificar", "Personalize o QR Code gerado", "Faça o download imediato da imagem em PNG"],
      faqs: [
        { question: "O QR Code tem validade?", answer: "Não, o código QR estático nunca expira." },
        { question: "Tem limite de geração?", answer: "Não, você pode gerar quantos códigos precisar gratuitamente." }
      ]
    },
    fr: {
      name: "Générateur de QR Code Standard",
      title: "Générateur de QR Code pour Paiements et Liens",
      description: "Générez des QR codes haute définition pour vos liens, réseaux et transactions avec téléchargement PNG instantané. Gratuit et sans pub.",
      intro: "Créez en quelques clics des QR codes haute résolution pour vos sites internet, liens de paiement et messages professionnels.",
      steps: ["Saisissez les informations à encoder", "Téléchargez l'image du QR code en haute définition", "Imprimez ou diffusez votre QR code"],
      faqs: [
        { question: "Le QR code a-t-il une durée de validité ?", answer: "Non, un QR code statique reste fonctionnel indéfiniment." },
        { question: "Y a-t-il des filigranes ajoutés ?", answer: "Aucun filigrane, l'image est 100% propre et professionnelle." }
      ]
    },
    de: {
      name: "Standard QR-Code Generator",
      title: "Kostenloser QR-Code Generator für Links & Text",
      description: "Erstellen Sie hochauflösende QR-Codes für Websites, Kontakte und Texte mit direktem PNG-Download. Privat und 100% kostenlos im Browser.",
      intro: "Universeller QR-Code-Generator zur schnellen Erstellung hochauflösender Codes für Webseiten, Zahlungsdaten und Kontaktdaten.",
      steps: ["Gewünschten Text oder Link eingeben", "QR-Code sofort generieren lassen", "Hochauflösende PNG-Datei herunterladen"],
      faqs: [
        { question: "Haben die QR-Codes ein Ablaufdatum?", answer: "Nein, statische QR-Codes sind dauerhaft und unbegrenzt gültig." },
        { question: "Ist der Download kostenlos?", answer: "Ja, alle QR-Codes können ohne Kosten frei genutzt werden." }
      ]
    },
    id: {
      name: "Generator QR Code Standar",
      title: "Generator QR Code Pembayaran & Tautan Gratis",
      description: "Buat kode QR resolusi tinggi untuk tautan, teks, dan pembayaran dengan unduhan PNG instan. 100% gratis dan aman langsung di browser.",
      intro: "Generator kode QR serbaguna untuk membuat QR Code resolusi tinggi untuk tautan situs, akun media sosial, dan data pembayaran.",
      steps: ["Ketikkan teks atau tautan yang ingin dijadikan QR Code", "Sistem membuat QR Code secara otomatis", "Unduh gambar PNG beresolusi tinggi"],
      faqs: [
        { question: "Apakah ada masa kedaluwarsa?", answer: "Tidak ada. QR Code statis berlaku selamanya." },
        { question: "Apakah ada biaya tersembunyi?", answer: "Gratis tanpa batasan jumlah pembuatan kode." }
      ]
    }
  },
  "free-qr-generator-without-watermark": {
    es: {
      name: "Generador QR Sin Marca de Agua",
      title: "Generador de QR Sin Marca de Agua Gratis en PNG",
      description: "Crea códigos QR limpios y profesionales sin marcas de agua ni caducidad. Diseña, personaliza y descarga gratis en alta resolución.",
      intro: "Genera códigos QR totalmente limpios sin logos molestos, publicidad ni fechas de vencimiento para uso comercial y personal.",
      steps: ["Introduce tu texto, enlace o información", "Comprueba el diseño limpio y nítido", "Descarga tu QR sin marcas de agua en PNG"],
      faqs: [
        { question: "¿Realmente no tiene marcas de agua?", answer: "100% garantizado: la imagen descargada no contiene ningún logo ni marca." },
        { question: "¿Puedo usarlo en productos comerciales?", answer: "Sí, es completamente libre para envases, cartas, carteles y papelería comercial." }
      ]
    },
    pt: {
      name: "Gerador de QR Sem Marca d'Água",
      title: "Gerador de QR Code Sem Marca d'Água Grátis",
      description: "Gere QR Codes limpos e profissionais sem marcas d'água e sem prazo de validade. Download grátis em alta resolução direto no navegador.",
      intro: "Crie códigos QR profissionais sem logotipos sobrepostos, anúncios ou limites de leitura para seus materiais de marketing.",
      steps: ["Digite o endereço ou dados a serem gravados", "Visualize o código limpo gerado em tempo real", "Baixe a imagem PNG sem marcas d'água"],
      faqs: [
        { question: "Tem algum logotipo impresso sobre o código?", answer: "Não, você recebe o QR Code totalmente limpo e nítido." },
        { question: "Posso utilizar na minha empresa?", answer: "Sim, uso comercial totalmente liberado e gratuito." }
      ]
    },
    fr: {
      name: "Générateur QR Sans Filigrane",
      title: "Générateur de QR Code Sans Filigrane Gratuit",
      description: "Créez des QR codes professionnels et nets sans aucun logo imposé ni date d'expiration. Téléchargement PNG haute résolution gratuit.",
      intro: "Générez des QR codes haute définition libres de tout filigrane ou publicité pour vos supports commerciaux et emballages.",
      steps: ["Saisissez le texte ou l'URL de votre choix", "Vérifiez le rendu net du QR code", "Téléchargez l'image haute définition sans filigrane"],
      faqs: [
        { question: "Le QR code est-il garanti sans filigrane ?", answer: "Oui, l'image exportée est 100% vierge de tout logo tiers ou filigrane." },
        { question: "L'usage commercial est-il autorisé ?", answer: "Oui, utilisation commerciale entièrement libre et gratuite." }
      ]
    },
    de: {
      name: "QR-Generator Ohne Wasserzeichen",
      title: "Kostenloser QR-Code Generator Ohne Wasserzeichen",
      description: "Erstellen Sie professionelle QR-Codes ohne störende Wasserzeichen oder Ablaufdatum. Hochauflösender PNG-Download kostenlos im Browser.",
      intro: "Erstellen Sie saubere, hochauflösende QR-Codes ohne Logos Dritter, Wasserzeichen oder zeitliche Begrenzung für Ihr Gewerbe.",
      steps: ["Link oder Inhalt eingeben", "QR-Code sofort erzeugen lassen", "Wasserzeichenfreies PNG herunterladen"],
      faqs: [
        { question: "Ist der QR-Code wirklich ohne Wasserzeichen?", answer: "Ja, Sie erhalten ein sauberes, professionelles Bild ohne störende Logos." },
        { question: "Darf der Code gewerblich genutzt werden?", answer: "Ja, uneingeschränkt für Printmedien, Flyer und Produkte nutzbar." }
      ]
    },
    id: {
      name: "Generator QR Tanpa Watermark",
      title: "Generator QR Code Tanpa Watermark & Bebas Biaya",
      description: "Buat kode QR bersih tanpa watermark dan tanpa masa kedaluwarsa. Desain kustom, unduh gambar resolusi tinggi gratis tanpa daftar.",
      intro: "Buat kode QR bersih tanpa logo pihak ketiga, bebas watermark, dan tanpa batasan waktu untuk keperluan bisnis maupun pribadi.",
      steps: ["Ketikkan link atau informasi yang diinginkan", "Lihat pratinjau kode QR yang bersih", "Unduh gambar PNG tanpa watermark langsung ke perangkat"],
      faqs: [
        { question: "Apakah benar-benar bebas watermark?", answer: "Ya, 100% bersih tanpa logo atau tulisan yang mengganggu." },
        { question: "Apakah boleh dipakai untuk kemasan produk jualan?", answer: "Boleh, bebas digunakan untuk keperluan komersial apa pun." }
      ]
    }
  },
  "merchant-reconciliation": {
    es: {
      name: "Conciliación de Pagos y Ventas",
      title: "Herramienta de Conciliación de Pagos Diarios",
      description: "Compara los registros de ventas de tu caja con el extracto bancario para detectar cobros faltantes o duplicados. Privado en tu navegador.",
      intro: "Cruza tus registros de tickets y ventas con tus movimientos bancarios para detectar discrepancias, cobros duplicados o pagos no acreditados.",
      steps: ["Importa la lista de ventas del sistema de caja", "Sube el extracto de cobros recibidos", "Revisa el informe de coincidencias y diferencias encontradas"],
      faqs: [
        { question: "¿Se conservan mis datos bancarios?", answer: "No, la conciliación se efectúa en la memoria local de tu navegador." },
        { question: "¿Permite conciliar múltiples métodos de pago?", answer: "Sí, facilita cuadrar ventas por tarjeta, transferencias y QR." }
      ]
    },
    pt: {
      name: "Conciliação de Vendas e Pagamentos",
      title: "Ferramenta de Conciliação de Vendas e Caixa",
      description: "Cruze os comprovantes de vendas com o extrato bancário para identificar divergências e pagamentos pendentes. Gratuito e seguro.",
      intro: "Compare o relatório de vendas do seu sistema com o extrato bancário para conferir se todos os pagamentos foram realmente creditados.",
      steps: ["Carregue a listagem de vendas realizadas", "Importe o extrato de recebimentos da conta", "Identifique imediatamente valores faltantes ou divergentes"],
      faqs: [
        { question: "Ajuda no fechamento mensal?", answer: "Sim, evita perdas financeiras por pagamentos não compensados." },
        { question: "É seguro para informações financeiras?", answer: "Totalmente seguro e executado localmente sem tráfego de dados para servidores." }
      ]
    },
    fr: {
      name: "Rapprochement des Ventes et Règlements",
      title: "Outil de Rapprochement des Ventes et Paiements",
      description: "Rapprochez vos tickets de caisse avec vos relevés bancaires pour repérer les anomalies et impayés. Traitement local et confidentiel.",
      intro: "Associez vos données de caisse à vos relevés bancaires pour identifier automatiquement les écarts d'encaissement et règlements en attente.",
      steps: ["Importez votre journal des ventes", "Téléversez le relevé des encaissements bancaires", "Consultez le bilan des écarts et opérations rapprochées"],
      faqs: [
        { question: "Mes données comptables sont-elles protégées ?", answer: "Oui, le traitement s'effectue strictement dans votre navigateur." },
        { question: "Peut-on exporter le résultat ?", answer: "Oui, vous pouvez exporter le compte-rendu pour votre comptable." }
      ]
    },
    de: {
      name: "Zahlungsabgleich & Kassenkontrolle",
      title: "Zahlungsabgleich & Kassenbuch Tool Kostenlos",
      description: "Gleichen Sie Kassenbelege mit Bankauszügen ab, um Differenzen und fehlende Buchungen schnell aufzuspüren. Lokal und sicher im Browser.",
      intro: "Gleichen Sie Buchungen aus Kassensystemen mit tatsächlichen Bankeingängen ab, um unbezahlte Posten und Fehlbuchungen aufzudecken.",
      steps: ["Verkaufspositionen importieren", "Zahlungseingänge aus dem Kontoauszug laden", "Differenzenbericht und ungeklärte Posten prüfen"],
      faqs: [
        { question: "Wie sicher ist der Abgleich?", answer: "Die Daten werden nicht hochgeladen, sondern rein lokal im Browser analysiert." },
        { question: "Spart das Tool Zeit bei der Buchhaltung?", answer: "Ja, Differenzen lassen sich in Sekunden statt Stunden lokalisieren." }
      ]
    },
    id: {
      name: "Rekonsiliasi Pembayaran & Transaksi",
      title: "Alat Rekonsiliasi Pembayaran & Kas Toko Gratis",
      description: "Cocokkan catatan penjualan harian dengan mutasi rekening untuk menemukan transaksi ganda atau belum masuk. Aman dan privat di browser.",
      intro: "Cocokkan catatan kasir toko Anda dengan mutasi rekening bank secara otomatis untuk memastikan tidak ada dana yang belum masuk atau transaksi ganda.",
      steps: ["Unggah catatan riwayat penjualan kasir", "Masukkan riwayat mutasi penerimaan bank", "Lihat laporan selisih transaksi dan status pencocokan dana"],
      faqs: [
        { question: "Apakah data mutasi bank aman?", answer: "Sangat aman karena data mutasi tidak pernah dikirim ke server luar." },
        { question: "Berapa lama proses rekonsiliasinya?", answer: "Berlangsung instan dalam hitungan detik di perangkat Anda." }
      ]
    }
  },
  "msme-receivables": {
    es: {
      name: "Control de Cobros Pendientes",
      title: "Control de Facturas Pendientes y Cobros de Clientes",
      description: "Gestiona la antigüedad de tus facturas por cobrar y genera cartas formales de reclamación de deudas comerciales al instante y gratis.",
      intro: "Lleva un control ordenado del vencimiento de tus facturas por cobrar y redacta cartas de requerimiento formal de pago para clientes deudores.",
      steps: ["Registra las facturas pendientes y sus fechas de emisión", "Analiza la antigüedad de la deuda (30, 60, 90+ días)", "Genera cartas formales de notificación de cobro en PDF"],
      faqs: [
        { question: "¿Permite clasificar facturas por antigüedad?", answer: "Sí, organiza las deudas por tramos de vencimiento para priorizar reclamaciones." },
        { question: "¿Las cartas de reclamación son descargables?", answer: "Sí, puedes copiarlas o descargarlas listas para su envío." }
      ]
    },
    pt: {
      name: "Controle de Contas a Receber",
      title: "Controle de Faturas e Contas a Receber Grátis",
      description: "Monitore faturas vencidas, organize contas a receber por idade da dívida e emita cartas de cobrança formais. 100% grátis no navegador.",
      intro: "Monitore faturas em aberto, analise o tempo de atraso dos clientes e emita notificações formais de cobrança para proteger o caixa da sua empresa.",
      steps: ["Cadastre as faturas a receber e datas de vencimento", "Acompanhe o relatório de inadimplência por faixas de atraso", "Gere cartas de cobrança formal para clientes em atraso"],
      faqs: [
        { question: "Ajuda a diminuir a inadimplência?", answer: "Sim, o acompanhamento estruturado facilita o recebimento mais ágil." },
        { question: "Posso exportar os relatórios?", answer: "Sim, tudo pronto para cópia ou download em formato PDF." }
      ]
    },
    fr: {
      name: "Suivi des Créances Clients",
      title: "Suivi des Factures Impayées et Créances Clients",
      description: "Suivez l'ancienneté de vos factures en attente et générez des courriers formels de relance de créances. Gratuit et confidentiel.",
      intro: "Pilotez vos créances clients par tranche d'âge d'arriérés et éditez des mises en demeure formelles pour accélérer le recouvrement de vos factures.",
      steps: ["Enregistrez vos factures impayées et dates limites", "Analysez la balance âgée de vos comptes clients", "Générez des courriers formels de mise en demeure en PDF"],
      faqs: [
        { question: "Qu'est-ce qu'une balance âgée ?", answer: "Un tableau récapitulatif classant les créances selon le nombre de jours de retard." },
        { question: "Les modèles de lettre sont-ils conformes ?", answer: "Oui, rédigés selon les règles légales de recouvrement amiable." }
      ]
    },
    de: {
      name: "Forderungsmanagement Tool",
      title: "Forderungsmanagement & Offene Posten Verwaltung",
      description: "Verwalten Sie offene Kundenrechnungen nach Fälligkeit und erstellen Sie förmliche Mahnschreiben. Kostenlos und diskret im Browser.",
      intro: "Überwachen Sie offene Posten nach Fälligkeitsstufen und erstellen Sie rechtssichere Mahn- und Erinnerungsschreiben für säumige Unternehmenskunden.",
      steps: ["Offene Rechnungen und Fälligkeitsdaten erfassen", "Forderungsspiegel nach Altersstruktur einsehen", "Formelles Mahnschreiben als PDF generieren"],
      faqs: [
        { question: "Wie hilft die Altersstrukturierung?", answer: "Sie erkennen kritische Zahlungsverzögerungen frühzeitig und können gezielt mahnen." },
        { question: "Kostet das Mahnwesen-Tool etwas?", answer: "Nein, dauerhaft kostenfrei für Freiberufler und mittelständische Betriebe." }
      ]
    },
    id: {
      name: "Manajemen Piutang Usaha",
      title: "Pelacak Piutang Usaha & Tagihan Pelanggan Gratis",
      description: "Pantau umur piutang jatuh tempo dan buat surat penagihan resmi untuk pelanggan yang belum melunasi invoice. Gratis dan aman di browser.",
      intro: "Kelola daftar piutang usaha yang belum dibayar, kelompokkan berdasarkan umur tagihan, dan buat surat peringatan penagihan resmi secara instan.",
      steps: ["Daftarkan invoice piutang dan tanggal jatuh temponya", "Analisis laporan umur piutang (aging receivables)", "Buat surat pemberitahuan penagihan resmi format PDF"],
      faqs: [
        { question: "Apa manfaat laporan umur piutang?", answer: "Membantu Anda mengetahui pelanggan mana yang menunggak paling lama agar segera ditindaklanjuti." },
        { question: "Apakah surat penagihan bisa disesuaikan?", answer: "Bisa, teks surat dapat diedit sesuai tingkat keakraban atau formalitas." }
      ]
    }
  }
};
