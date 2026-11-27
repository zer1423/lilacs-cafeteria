document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('contactFormStatus');
  if (!form || !statusEl) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const inquiry = document.getElementById('inquiry').value.trim();

    statusEl.className = 'mt-3 text-center small';

    if (!firstName || !lastName || !email || !inquiry) {
      statusEl.classList.add('text-danger', 'fw-semibold');
      statusEl.textContent = 'Please fill in all required fields before submitting.';
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusEl.classList.add('text-danger', 'fw-semibold');
      statusEl.textContent = 'Please enter a valid email address.';
      return;
    }

    statusEl.classList.add('text-success', 'fw-semibold');
    statusEl.textContent = `Thank you, ${firstName}! Your message has been received. For urgent inquiries, please call 0917 592 0609.`;
    form.reset();
  });
});
