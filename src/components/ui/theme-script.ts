/**
 * Script chạy đồng bộ trong <head>, trước khi trình duyệt vẽ, để gán
 * `data-theme` đúng chủ đề đã lưu (`sf.prefs.theme`). Mặc định `dark`.
 * Mọi truy cập localStorage bọc try/catch: chế độ riêng tư hoặc chặn dữ liệu
 * trang web vẫn rơi về chủ đề tối, không văng lỗi.
 */
export const THEME_SCRIPT: string = `(function(){var t="dark";try{var raw=window.localStorage.getItem("sf.prefs");if(raw){var p=JSON.parse(raw);if(p&&(p.theme==="light"||p.theme==="dark")){t=p.theme;}}}catch(e){}document.documentElement.setAttribute("data-theme",t);})();`;
