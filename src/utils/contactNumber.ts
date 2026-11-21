export const getContactNumberDigits = (value?: string | null) =>
  (value || "").replace(/\D/g, "");

export const formatContactNumber = (value?: string | null) => {
  const digits = getContactNumberDigits(value).slice(0, 11);

  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
};

export const isElevenDigitContactNumber = (value?: string | null) =>
  getContactNumberDigits(value).length === 11;
