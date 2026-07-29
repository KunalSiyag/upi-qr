import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ url }) => {
  const title = url.searchParams.get("title") || "Free Universal UPI QR Generator";
  const description = url.searchParams.get("description") || "Generate instant payment QR codes for SBI, PhonePe, Paytm, GPay & any Indian bank account.";
  const badge = url.searchParams.get("badge") || "Free Web Tool • No Signup";

  // Escape XML special characters
  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const safeTitle = escapeXml(title);
  const safeDesc = escapeXml(description.length > 120 ? description.substring(0, 117) + "..." : description);
  const safeBadge = escapeXml(badge);

  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#0B231A"/>
    
    <!-- Background Decorative Gradients & Mesh -->
    <circle cx="1100" cy="100" r="450" fill="#1C5E43" opacity="0.35" filter="blur(60px)"/>
    <circle cx="150" cy="550" r="350" fill="#2D7A58" opacity="0.25" filter="blur(50px)"/>
    
    <!-- Grid Pattern overlay -->
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>
    <rect width="1200" height="630" fill="url(#grid)"/>

    <!-- Main Card Container -->
    <rect x="60" y="60" width="1080" height="510" rx="32" fill="#113B2C" stroke="#2D7A58" stroke-width="2" stroke-opacity="0.5"/>
    
    <!-- Brand Header -->
    <g transform="translate(110, 115)">
      <!-- Logo Icon -->
      <rect x="0" y="0" width="48" height="48" rx="14" fill="#EBFBF3"/>
      <path d="M14 14H22V22H14V14ZM26 14H34V22H26V14ZM14 26H22V34H14V26Z" fill="#113B2C"/>
      <rect x="28" y="28" width="6" height="6" fill="#2D7A58"/>
      
      <!-- Brand Name -->
      <text x="64" y="33" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" letter-spacing="-0.5px">Pro UPI QR</text>
      <text x="210" y="33" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="20" fill="#2D7A58">.in</text>
      
      <!-- Badge Pill -->
      <rect x="720" y="4" width="220" height="38" rx="19" fill="#1C5E43" stroke="#2D7A58" stroke-width="1"/>
      <text x="830" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="14" fill="#EBFBF3" text-anchor="middle" letter-spacing="0.5px">${safeBadge}</text>
    </g>

    <!-- Content Area -->
    <g transform="translate(110, 230)">
      <!-- Title -->
      <text x="0" y="40" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="46" fill="#FFFFFF" letter-spacing="-1px">
        ${safeTitle.length > 45 ? safeTitle.substring(0, 42) + "..." : safeTitle}
      </text>
      
      <!-- Subtitle/Description -->
      <text x="0" y="110" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="22" fill="#A3D9C0" width="700">
        ${safeDesc}
      </text>
    </g>

    <!-- Decorative QR Code Frame on Right -->
    <g transform="translate(860, 210)">
      <rect x="0" y="0" width="210" height="210" rx="24" fill="#EBFBF3" stroke="#2D7A58" stroke-width="3"/>
      
      <!-- Corner Markers -->
      <rect x="25" y="25" width="50" height="50" rx="10" fill="#113B2C"/>
      <rect x="35" y="35" width="30" height="30" rx="5" fill="#EBFBF3"/>
      <rect x="42" y="42" width="16" height="16" rx="3" fill="#113B2C"/>

      <rect x="135" y="25" width="50" height="50" rx="10" fill="#113B2C"/>
      <rect x="145" y="35" width="30" height="30" rx="5" fill="#EBFBF3"/>
      <rect x="152" y="42" width="16" height="16" rx="3" fill="#113B2C"/>

      <rect x="25" y="135" width="50" height="50" rx="10" fill="#113B2C"/>
      <rect x="35" y="145" width="30" height="30" rx="5" fill="#EBFBF3"/>
      <rect x="42" y="152" width="16" height="16" rx="3" fill="#113B2C"/>

      <!-- Random Data Blocks -->
      <rect x="95" y="30" width="15" height="15" rx="3" fill="#2D7A58"/>
      <rect x="95" y="60" width="25" height="15" rx="3" fill="#113B2C"/>
      <rect x="30" y="95" width="40" height="15" rx="3" fill="#2D7A58"/>
      <rect x="85" y="95" width="30" height="30" rx="6" fill="#113B2C"/>
      <rect x="135" y="95" width="45" height="15" rx="3" fill="#2D7A58"/>
      <rect x="95" y="140" width="20" height="40" rx="4" fill="#2D7A58"/>
      <rect x="130" y="135" width="50" height="50" rx="12" fill="#113B2C"/>
      <rect x="145" y="150" width="20" height="20" rx="4" fill="#EBFBF3"/>
    </g>

    <!-- Footer Security Trust Banner -->
    <g transform="translate(110, 500)">
      <rect x="0" y="0" width="980" height="1" fill="#2D7A58" opacity="0.4"/>
      <text x="0" y="30" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="16" fill="#2D7A58">✓ 100% Free &amp; Instant</text>
      <text x="220" y="30" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="16" fill="#2D7A58">✓ Zero Server Data Storage</text>
      <text x="490" y="30" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="16" fill="#2D7A58">✓ High-Res Vector SVG / PDF Export</text>
    </g>
  </svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
