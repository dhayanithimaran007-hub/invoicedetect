const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "";

function getEndpoint(path) {
  if (backendBaseUrl) {
    return `${backendBaseUrl.replace(/\/$/, "")}${path}`;
  }
  return path;
}

export async function uploadInvoiceToBackend(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(getEndpoint("/api/upload-invoice"), {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Invoice upload failed: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function analyzeInvoicePayload(payload) {
  const response = await fetch(getEndpoint("/api/analyze-invoice"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Invoice analysis failed: ${errorText || response.statusText}`);
  }

  return response.json();
}
