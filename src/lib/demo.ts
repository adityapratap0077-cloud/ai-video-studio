"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const COOKIE_NAME = "avs_demo";

/**
 * Demo mode: on when `?demo=1` is in the URL, or the `avs_demo=1` cookie
 * is set (toggled from Settings). Backend seeds demo projects; the client
 * just renders them with a badge/banner.
 */
export function useDemoMode(): {
  demo: boolean;
  setDemo: (v: boolean) => void;
} {
  const params = useSearchParams();
  const [cookieDemo, setCookieDemo] = useState(
    () =>
      typeof document !== "undefined" &&
      document.cookie.split(";").some((c) => c.trim() === `${COOKIE_NAME}=1`)
  );

  const viaParam = params.get("demo") === "1";

  const setDemo = useCallback((v: boolean) => {
    document.cookie = v
      ? `${COOKIE_NAME}=1; path=/; max-age=31536000; SameSite=Lax`
      : `${COOKIE_NAME}=0; path=/; max-age=0; SameSite=Lax`;
    setCookieDemo(v);
  }, []);

  return { demo: viaParam || cookieDemo, setDemo };
}
