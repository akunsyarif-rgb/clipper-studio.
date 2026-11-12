import { useRef, useState } from "react";

export default function useRenderState() {
const abort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [renderError, setRenderError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  return { abort, errorDetail, progress, renderError, rendering, result, setErrorDetail, setProgress, setRenderError, setRendering, setResult, setStatus, status };
}
