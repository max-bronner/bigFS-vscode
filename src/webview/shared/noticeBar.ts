const NOTICE_MILLISECONDS = 6000;

export const showNotice = (message: string): void => {
  const notice = document.getElementById('notice')!;

  notice.textContent = message;
  notice.hidden = false;
  setTimeout(() => {
    notice.hidden = true;
  }, NOTICE_MILLISECONDS);
};
