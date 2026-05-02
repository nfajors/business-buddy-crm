import logo from "@/assets/logo.png";

export function Brand({ className = "h-8" }: { className?: string }) {
  return <img src={logo} alt="Winning.Careers" className={className} />;
}

export function BrandText({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      <span className="text-gold">Winning</span>
      <span className="text-foreground">.Careers</span>
    </span>
  );
}