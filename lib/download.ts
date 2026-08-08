export async function downloadFromUrl(url: string, filename: string): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok) return false;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
  return true;
}
