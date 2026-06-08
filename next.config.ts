import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/pronosticos", destination: "/" },
      { source: "/tabla", destination: "/" },
      { source: "/resultados", destination: "/" },
      { source: "/reglas", destination: "/" },
      { source: "/admin", destination: "/" },
    ];
  },
};

export default nextConfig;
