"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { truncAddr } from "@/lib/utils";
import { anvilBaseSepolia } from "@/lib/wagmi";
import { ADDRESSES } from "@/lib/addresses";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/submit", label: "Submit Request" },
  { href: "/compliance", label: "Compliance" },
  { href: "/vault", label: "Vault" },
  { href: "/agents", label: "Agents" },
];

export function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: anvilBaseSepolia.id });
  const [contractStatus, setContractStatus] = useState<"idle" | "checking" | "ready" | "missing">("idle");
  const didAutoSwitch = useRef(false);

  const wrongChain = isConnected && chainId !== anvilBaseSepolia.id;
  const missingContracts = isConnected && chainId === anvilBaseSepolia.id && contractStatus === "missing";

  useEffect(() => {
    if (!isConnected) {
      didAutoSwitch.current = false;
      setContractStatus("idle");
      return;
    }

    if (chainId !== anvilBaseSepolia.id) {
      setContractStatus("idle");
      if (!didAutoSwitch.current) {
        didAutoSwitch.current = true;
        switchChain({ chainId: anvilBaseSepolia.id });
      }
      return;
    }

    let cancelled = false;
    setContractStatus("checking");
    publicClient
      ?.getCode({ address: ADDRESSES.DiligencePortal as `0x${string}` })
      .then((code) => {
        if (cancelled) return;
        setContractStatus(code && code !== "0x" ? "ready" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setContractStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, chainId, publicClient, switchChain]);

  return (
    <header className="border-b border-surface-3 bg-surface-1/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-tight text-white">
            RWA<span className="text-accent">Vault</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  pathname === l.href
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-zinc-200 hover:bg-surface-3"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          {isConnected ? (
            <div className="flex items-center gap-2">
              {wrongChain ? (
                <button
                  onClick={() => switchChain({ chainId: anvilBaseSepolia.id })}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-warning/15 text-warning hover:bg-warning/25"
                >
                  {isSwitchingChain ? "Switching..." : "Wrong network"}
                </button>
              ) : null}
              <button
                onClick={() => disconnect()}
                className="px-3 py-1.5 rounded-md text-xs font-mono bg-surface-3 text-zinc-300 hover:bg-surface-4"
              >
                {truncAddr(address!)}
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: injected(), chainId: anvilBaseSepolia.id })}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent/90"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
      {(wrongChain || missingContracts) && (
        <div className="border-t border-surface-3 bg-warning/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs text-warning flex items-center justify-between gap-3">
            <span>
              {wrongChain
                ? `Wallet is on chain ${chainId}. Switch to ${anvilBaseSepolia.name} (${anvilBaseSepolia.id}).`
                : "Connected chain id is correct, but DiligencePortal is not deployed on this RPC endpoint."}
            </span>
            {wrongChain ? (
              <button
                onClick={() => switchChain({ chainId: anvilBaseSepolia.id })}
                className="px-2 py-1 rounded bg-warning/20 hover:bg-warning/30 text-warning whitespace-nowrap"
              >
                {isSwitchingChain ? "Switching..." : "Switch network"}
              </button>
            ) : (
              <span className="text-[11px] text-zinc-300 whitespace-nowrap">Expected RPC: http://127.0.0.1:8545</span>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
