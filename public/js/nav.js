(function () {
  async function loadBusinessInfo() {
    try {
      const res = await fetch('/api/business');
      const phoneEls = document.querySelectorAll('[data-biz-phone]');
      const addressEls = document.querySelectorAll('[data-biz-address]');
      const detailsContainers = document.querySelectorAll('[data-biz-details]');
      const unavailableNotices = document.querySelectorAll('[data-biz-unavailable]');
      const mapLinkEl = document.getElementById('contactMapLink');
      const taglineEl = document.getElementById('homeTagline');

      if (!res.ok) {
        if (res.status === 404) {
          // Business Rule 3: while no business record exists, hide business details
          detailsContainers.forEach((el) => el.classList.add('d-none'));
          unavailableNotices.forEach((el) => el.classList.remove('d-none'));
          window.LILACS_BUSINESS = null;
          document.dispatchEvent(new CustomEvent('lilacs:business-loaded', { detail: null }));
        }
        return;
      }

      const biz = await res.json();
      window.LILACS_BUSINESS = biz;

      detailsContainers.forEach((el) => el.classList.remove('d-none'));
      unavailableNotices.forEach((el) => el.classList.add('d-none'));

      phoneEls.forEach((el) => {
        el.textContent = biz.phone || '';
      });

      const fullAddress = [biz.address, biz.city].filter(Boolean).join(', ');
      addressEls.forEach((el) => {
        el.textContent = fullAddress;
      });

      if (taglineEl && biz.tagline) {
        taglineEl.textContent = biz.tagline;
      }

      if (mapLinkEl && biz.map_link) {
        mapLinkEl.href = biz.map_link;
        mapLinkEl.classList.remove('d-none');
      }

      document.dispatchEvent(new CustomEvent('lilacs:business-loaded', { detail: biz }));
    } catch (err) {
      console.error('Failed to load business info:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', loadBusinessInfo);
})();
