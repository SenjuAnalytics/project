import type { NextConfig } from "next";
import path from "path";

const STUB = path.resolve("./lib/empty-module.js");

// Packages that have missing optional deps (@x402/*) — stub them out
const X402_STUBS: Record<string, string> = {
  "@x402/core/client":      STUB,
  "@x402/evm":              STUB,
  "@x402/evm/exact/client": STUB,
  "@x402/evm/upto/client":  STUB,
  "@x402/svm/exact/client": STUB,
};

const nextConfig: NextConfig = {
  // Allow importing the repo-root single source of truth (../deployments/*.json),
  // which lives outside the frontend/ directory.
  experimental: {
    externalDir: true,
  },

  // Exclude server-only Coinbase SDK packages from client bundle
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],

  // Turbopack aliases (Next.js 16 dev mode)
  turbopack: {
    // Root is the repo root (parent of frontend/) so Turbopack can resolve the single source of
    // truth at ../deployments/*.json, which lives outside frontend/. Setting root explicitly also
    // stops Turbopack from walking up to a lockfile in the user's home directory and inferring the
    // wrong workspace root.
    root: path.resolve(".."),
    resolveAlias: {
      "@x402/core/client":      STUB,
      "@x402/evm":              STUB,
      "@x402/evm/exact/client": STUB,
      "@x402/evm/upto/client":  STUB,
      "@x402/svm/exact/client": STUB,
    },
  },

  // Webpack aliases (next build / production)
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...X402_STUBS,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
