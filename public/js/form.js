/**
 * Form Validation, Promo Code & Razorpay Payment Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('enrollmentForm');
  const courseSelect = document.getElementById('courseSelect');
  const promoCodeInput = document.getElementById('promoCode');
  const applyPromoBtn = document.getElementById('applyPromoBtn');
  const promoStatusMessage = document.getElementById('promoStatusMessage');
  const submitPaymentBtn = document.getElementById('submitPaymentBtn');
  const overlayLoader = document.getElementById('overlayLoader');

  // Summary Elements
  const summaryCourseName = document.getElementById('summaryCourseName');
  const summaryOriginalFee = document.getElementById('summaryOriginalFee');
  const summaryDiscountRow = document.getElementById('summaryDiscountRow');
  const appliedPromoBadge = document.getElementById('appliedPromoBadge');
  const summaryDiscountAmount = document.getElementById('summaryDiscountAmount');
  const summaryFinalTotal = document.getElementById('summaryFinalTotal');

  // State
  let currentOriginalPrice = 249;
  let currentDiscount = 0;
  let currentFinalAmount = 249;
  let currentAppliedPromo = '';

  // 1. Pre-select course from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const courseParam = urlParams.get('course');
  if (courseParam && courseSelect.querySelector(`option[value="${courseParam}"]`)) {
    courseSelect.value = courseParam;
  }

  // Update summary UI text based on selected course
  function updateCourseSummaryUI() {
    const selectedOption = courseSelect.options[courseSelect.selectedIndex];
    if (selectedOption) {
      summaryCourseName.textContent = selectedOption.text.split('&')[0];
    }
  }
  updateCourseSummaryUI();
  courseSelect.addEventListener('change', updateCourseSummaryUI);

  // 2. Field Validation Helpers
  function validateFullName() {
    const field = document.getElementById('fullName');
    const errorEl = document.getElementById('fullNameError');
    const isValid = field.value.trim().length >= 2;
    toggleFieldState(field, errorEl, isValid);
    return isValid;
  }

  function validateEmail() {
    const field = document.getElementById('email');
    const errorEl = document.getElementById('emailError');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(field.value.trim());
    toggleFieldState(field, errorEl, isValid);
    return isValid;
  }

  function validateWhatsApp() {
    const field = document.getElementById('whatsappNumber');
    const errorEl = document.getElementById('whatsappNumberError');
    const cleanPhone = field.value.trim().replace(/[\s\-\+]/g, '').replace(/^(?:91|0)/, '');
    const phoneRegex = /^[6-9]\d{9}$/;
    const isValid = phoneRegex.test(cleanPhone);
    toggleFieldState(field, errorEl, isValid);
    return isValid;
  }

  function validateSelect(fieldId, errorId) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(errorId);
    const isValid = field.value !== '';
    toggleFieldState(field, errorEl, isValid);
    return isValid;
  }

  function validateCollege() {
    const field = document.getElementById('collegeName');
    const errorEl = document.getElementById('collegeNameError');
    const isValid = field.value.trim().length > 0;
    toggleFieldState(field, errorEl, isValid);
    return isValid;
  }

  function validateTerms() {
    const field = document.getElementById('termsAccepted');
    const errorEl = document.getElementById('termsAcceptedError');
    const isValid = field.checked;
    if (errorEl) {
      errorEl.classList.toggle('active', !isValid);
    }
    return isValid;
  }

  function toggleFieldState(field, errorEl, isValid) {
    if (isValid) {
      field.classList.remove('is-invalid');
      field.classList.add('is-valid');
      if (errorEl) errorEl.classList.remove('active');
    } else {
      field.classList.remove('is-valid');
      field.classList.add('is-invalid');
      if (errorEl) errorEl.classList.add('active');
    }
  }

  // Real-time blur listeners
  document.getElementById('fullName').addEventListener('blur', validateFullName);
  document.getElementById('email').addEventListener('blur', validateEmail);
  document.getElementById('whatsappNumber').addEventListener('blur', validateWhatsApp);
  document.getElementById('collegeName').addEventListener('blur', validateCollege);

  // 3. Promo Code Application Logic
  applyPromoBtn.addEventListener('click', async () => {
    const code = promoCodeInput.value.trim();
    if (!code) {
      promoStatusMessage.className = 'promo-status error';
      promoStatusMessage.textContent = 'Please enter a promo code.';
      return;
    }

    applyPromoBtn.disabled = true;
    applyPromoBtn.textContent = 'Checking...';

    try {
      const response = await fetch('/api/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoCode: code,
          courseId: courseSelect.value
        })
      });

      const data = await response.json();

      if (data.success) {
        currentAppliedPromo = data.promoCode;
        currentOriginalPrice = data.originalAmount;
        currentDiscount = data.discountAmount;
        currentFinalAmount = data.finalAmount;

        // Update Summary UI
        summaryOriginalFee.textContent = `₹${currentOriginalPrice.toLocaleString('en-IN')}`;
        summaryDiscountAmount.textContent = `-₹${currentDiscount.toLocaleString('en-IN')}`;
        appliedPromoBadge.textContent = currentAppliedPromo;
        summaryDiscountRow.style.display = 'flex';
        summaryFinalTotal.textContent = `₹${currentFinalAmount.toLocaleString('en-IN')}`;

        promoStatusMessage.className = 'promo-status success';
        promoStatusMessage.textContent = `✓ ${data.message}`;
      } else {
        resetPromoSummary();
        promoStatusMessage.className = 'promo-status error';
        promoStatusMessage.textContent = `⚠️ ${data.message}`;
      }
    } catch (err) {
      console.error('[PROMO API ERROR]', err);
      promoStatusMessage.className = 'promo-status error';
      promoStatusMessage.textContent = 'Failed to validate promo code. Check network connection.';
    } finally {
      applyPromoBtn.disabled = false;
      applyPromoBtn.textContent = 'Apply';
    }
  });

  function resetPromoSummary() {
    currentAppliedPromo = '';
    currentDiscount = 0;
    currentFinalAmount = currentOriginalPrice;
    summaryDiscountRow.style.display = 'none';
    summaryFinalTotal.textContent = `₹${currentOriginalPrice.toLocaleString('en-IN')}`;
  }

  // 4. Form Submission & Razorpay Order Creation
  submitPaymentBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    // Run all field validations
    const isNameValid = validateFullName();
    const isEmailValid = validateEmail();
    const isPhoneValid = validateWhatsApp();
    const isCollegeValid = validateCollege();
    const isStreamValid = validateSelect('stream', 'streamError');
    const isSpecValid = validateSelect('specialization', 'specializationError');
    const isSemValid = validateSelect('semester', 'semesterError');
    const isTermsValid = validateTerms();

    if (!isNameValid || !isEmailValid || !isPhoneValid || !isCollegeValid || !isStreamValid || !isSpecValid || !isSemValid || !isTermsValid) {
      // Scroll smoothly to first invalid element
      const firstInvalid = document.querySelector('.is-invalid, .checkbox-control:invalid');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus();
      }
      return;
    }

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      email: document.getElementById('email').value.trim(),
      whatsappNumber: document.getElementById('whatsappNumber').value.trim().replace(/[\s\-\+]/g, ''),
      collegeName: document.getElementById('collegeName').value.trim(),
      stream: document.getElementById('stream').value,
      specialization: document.getElementById('specialization').value,
      semester: document.getElementById('semester').value,
      courseId: courseSelect.value,
      promoCode: currentAppliedPromo,
      termsAccepted: document.getElementById('termsAccepted').checked
    };

    // Show Loading Overlay
    overlayLoader.classList.add('active');
    submitPaymentBtn.disabled = true;

    try {
      // Step A: Create order on backend
      const orderResponse = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const orderData = await orderResponse.json();

      if (!orderData.success) {
        overlayLoader.classList.remove('active');
        submitPaymentBtn.disabled = false;
        alert(`Order Creation Failed: ${orderData.message}`);
        return;
      }

      // Handle 100% Free Promo Code Direct Success
      if (orderData.isFree) {
        console.log('[FREE ENROLLMENT] 100% Discount applied, redirecting to success.');
        if (orderData.pdfDataUri) {
          try { sessionStorage.setItem('pdfData_' + orderData.registrationId, orderData.pdfDataUri); } catch (e) {}
        }
        window.location.href = `/success.html?regId=${orderData.registrationId}&pdfUrl=${encodeURIComponent(orderData.pdfUrl || '')}`;
        return;
      }

      // Step B: Configure Razorpay Modal Checkout Options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'D & T CAREER PLANNERS LLP',
        description: `Enrollment: ${orderData.courseName}`,
        image: '/images/logo.png',
        order_id: orderData.orderId,
        prefill: {
          name: payload.fullName,
          email: payload.email,
          contact: payload.whatsappNumber
        },
        theme: {
          color: '#0056A4'
        },
        handler: async function (response) {
          // Step C: Payment completed on frontend modal, now send credentials for signature verification
          overlayLoader.classList.add('active');
          try {
            const verifyResponse = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                registrationData: {
                  ...payload,
                  courseName: orderData.courseName,
                  originalAmount: orderData.originalAmount,
                  discountAmount: orderData.discountAmount,
                  finalAmount: orderData.finalAmount
                }
              })
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
              if (verifyData.pdfDataUri) {
                try { sessionStorage.setItem('pdfData_' + verifyData.registrationId, verifyData.pdfDataUri); } catch (e) {}
              }
              // Redirect to Success Page with Registration ID
              window.location.href = `/success.html?regId=${verifyData.registrationId}&pdfUrl=${encodeURIComponent(verifyData.pdfUrl || '')}`;
            } else {
              // Signature verification failed
              window.location.href = `/failed.html?reason=${encodeURIComponent(verifyData.message)}`;
            }
          } catch (err) {
            console.error('[VERIFICATION FETCH ERROR]', err);
            window.location.href = `/failed.html?reason=${encodeURIComponent('Network error during payment verification.')}`;
          }
        },
        modal: {
          ondismiss: function () {
            overlayLoader.classList.remove('active');
            submitPaymentBtn.disabled = false;
            console.log('Razorpay checkout modal closed by user.');
          }
        }
      };

      // Handle Mock / Demo mode execution if Razorpay SDK fails or in mock test mode
      if (orderData.isMock) {
        console.log('[MOCK CHECKOUT] Simulated payment flow trigger.');
        setTimeout(async () => {
          const mockPaymentId = 'pay_mock_' + Date.now();
          const mockSignature = 'sig_mock_verified';

          const verifyResponse = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: orderData.orderId,
              razorpay_payment_id: mockPaymentId,
              razorpay_signature: mockSignature,
              registrationData: {
                ...payload,
                courseName: orderData.courseName,
                originalAmount: orderData.originalAmount,
                discountAmount: orderData.discountAmount,
                finalAmount: orderData.finalAmount
              }
            })
          });

          const verifyData = await verifyResponse.json();
          if (verifyData.success) {
            if (verifyData.pdfDataUri) {
              try { sessionStorage.setItem('pdfData_' + verifyData.registrationId, verifyData.pdfDataUri); } catch (e) {}
            }
            window.location.href = `/success.html?regId=${verifyData.registrationId}&pdfUrl=${encodeURIComponent(verifyData.pdfUrl || '')}`;
          } else {
            window.location.href = `/failed.html?reason=${encodeURIComponent(verifyData.message)}`;
          }
        }, 1200);
        return;
      }

      // Open official Razorpay modal window
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        overlayLoader.classList.remove('active');
        submitPaymentBtn.disabled = false;
        console.error('[RAZORPAY PAYMENT FAILED]', response.error);
        window.location.href = `/failed.html?reason=${encodeURIComponent(response.error.description || 'Payment was declined or failed.')}`;
      });
      
      overlayLoader.classList.remove('active');
      rzp.open();

    } catch (err) {
      console.error('[ORDER CREATION ERROR]', err);
      overlayLoader.classList.remove('active');
      submitPaymentBtn.disabled = false;
      alert('Network or server error while initiating payment. Please try again.');
    }
  });
});
