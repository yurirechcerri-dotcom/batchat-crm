"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useT } from "@/lib/i18n/IdiomaProvider";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import styles from "./PublicBrandFrame.module.css";

/** A apresentação BatChat só envolve o login; recuperação e MFA mantêm sua casca. */
export function PublicBrandFrame({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  if (name !== "BatChat" || pathname !== "/login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        {children}
      </div>
    );
  }

  return (
    <div className={styles.frame} data-testid="batchat-login-frame">
      <section className={styles.presentation} aria-label="BatChat">
        <div className={styles.brandCopy}>
          <div className={styles.signature}>
            <Image
              src="/brand/batchat/morcego-balao.svg"
              alt=""
              width={72}
              height={50}
              unoptimized
            />
            <span>BatChat</span>
          </div>
          <p className={styles.headline}>{t("Suas conversas e automações num só lugar.")}</p>
          <ul className={styles.benefits}>
            <li>{t("WhatsApp e Instagram na mesma caixa de entrada")}</li>
            <li>{t("Agente de IA responde e chama a equipe na hora certa")}</li>
            <li>{t("Fluxos com espera e lembrete que param sozinhos")}</li>
          </ul>
        </div>
      </section>
      <div className={styles.formPanel}>
        <div className={styles.appearance}><ThemeToggle /></div>
        <div className={styles.formContent}>{children}</div>
      </div>
    </div>
  );
}
