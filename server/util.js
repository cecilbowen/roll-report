export const formatDate = (date = new Date()) => {
  const pad = n => String(n).padStart(2, "0");

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
