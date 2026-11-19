const NOTICE_MILLISECONDS = 6000;

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const showNotice = (message: string): void => {
  const notice = document.getElementById('notice')!;

  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    notice.hidden = true;
  }, NOTICE_MILLISECONDS);
};
