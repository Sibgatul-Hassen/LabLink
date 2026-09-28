import logoMarkLight from "../assets/brand/logo-mark.webp";
import logoMarkDark from "../assets/brand/logo-mark-dark.webp";
import logoFullLight from "../assets/brand/logo-full.webp";
import logoFullDark from "../assets/brand/logo-full-dark.webp";

interface ThemeLogoProps {
  variant?: "mark" | "full";
  alt?: string;
  className?: string;
}

// Renders both colourings of the logo; CSS in index.css shows the one matching
// the user's saved theme (documentElement data-theme), so it switches instantly.
// Light theme: the small "l" is white. Dark theme: the small "l" is black.
export default function ThemeLogo({ variant = "mark", alt = "", className = "" }: ThemeLogoProps) {
  const [light, dark] = variant === "full" ? [logoFullLight, logoFullDark] : [logoMarkLight, logoMarkDark];
  return (
    <>
      <img src={light} alt={alt} className={`theme-logo-light ${className}`} />
      <img src={dark} alt={alt} className={`theme-logo-dark ${className}`} />
    </>
  );
}
