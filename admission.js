/* Online admission application form: validation and mock submit. */
(() => {
    "use strict";

    const MOCK_SEND_DELAY = 1100;

    const MESSAGES = {
        fullName: {
            valueMissing: "Please enter your full name.",
            tooShort: "Name should be at least 2 characters.",
        },
        email: {
            valueMissing: "Please enter your email address.",
            typeMismatch: "Please enter a valid email address.",
        },
        phone: {
            valueMissing: "Please enter your phone number.",
            patternMismatch: "Please enter a valid phone number.",
        },
        guardianPhone: {
            valueMissing: "Please enter a parent or guardian phone number.",
            patternMismatch: "Please enter a valid phone number.",
        },
        dob: {
            valueMissing: "Please enter your date of birth.",
            rangeOverflow: "Date of birth cannot be in the future.",
        },
        course: {
            valueMissing: "Please select a course.",
        },
        declaration: {
            valueMissing: "Please confirm the declaration before submitting.",
        },
    };

    function initAdmissionForm() {
        const form = document.querySelector("[data-admission-form]");
        if (!form) return;

        const fields = Array.from(
            form.querySelectorAll(".admission-field__input, .admission-checkbox input, .admission-radio input")
        );
        const textFields = Array.from(form.querySelectorAll(".admission-field__input"));
        const genderInputs = Array.from(form.querySelectorAll('input[name="gender"]'));
        const declaration = form.querySelector("#admission-declaration");
        const submitBtn = form.querySelector(".admission-form__submit");
        const submitLabel = submitBtn?.querySelector(".admission-form__submit-label");
        const status = form.querySelector(".admission-form__status");
        const defaultLabel = submitLabel?.textContent || "Submit";
        const dobInput = form.querySelector("#admission-dob");

        if (dobInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, "0");
            const dd = String(today.getDate()).padStart(2, "0");
            dobInput.max = `${yyyy}-${mm}-${dd}`;
        }

        function errorFor(input) {
            const { validity } = input;
            if (validity.valid) return "";
            const map = MESSAGES[input.name] || {};
            const key = Object.keys(map).find((k) => validity[k]);
            return key ? map[key] : input.validationMessage;
        }

        function setFieldError(wrapper, input, message) {
            const errorEl = wrapper?.querySelector(".admission-field__error");
            wrapper?.classList.toggle("is-invalid", Boolean(message));
            if (input) input.setAttribute("aria-invalid", String(Boolean(message)));
            if (errorEl) errorEl.textContent = message;
            return !message;
        }

        function validateInput(input) {
            const wrapper = input.closest(".admission-field");
            return setFieldError(wrapper, input, errorFor(input));
        }

        function validateGender() {
            const wrapper = form.querySelector(".admission-field--full .admission-field__radios")?.closest(".admission-field");
            const selected = genderInputs.some((input) => input.checked);
            const message = selected ? "" : "Please select a gender.";
            genderInputs.forEach((input) => input.setAttribute("aria-invalid", String(!selected)));
            return setFieldError(wrapper, null, message);
        }

        function validateDeclaration() {
            const wrapper = declaration?.closest(".admission-field");
            return setFieldError(wrapper, declaration, errorFor(declaration));
        }

        function setStatus(text, isError) {
            if (!status) return;
            status.textContent = "";
            status.classList.toggle("is-error", Boolean(isError));
            window.requestAnimationFrame(() => {
                status.textContent = text;
            });
        }

        textFields.forEach((input) => {
            input.addEventListener("blur", () => {
                if (input.value.trim() !== "" || input.hasAttribute("aria-invalid")) validateInput(input);
            });
            input.addEventListener("input", () => {
                if (input.closest(".admission-field")?.classList.contains("is-invalid")) validateInput(input);
            });
            input.addEventListener("change", () => {
                if (input.closest(".admission-field")?.classList.contains("is-invalid")) validateInput(input);
            });
        });

        genderInputs.forEach((input) => {
            input.addEventListener("change", () => {
                if (input.closest(".admission-field")?.classList.contains("is-invalid")) validateGender();
            });
        });

        declaration?.addEventListener("change", () => {
            if (declaration.closest(".admission-field")?.classList.contains("is-invalid")) validateDeclaration();
        });

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (submitBtn?.classList.contains("is-loading")) return;

            textFields.forEach((input) => {
                if (input.type === "email" || input.type === "tel" || input.type === "text") {
                    input.value = input.value.trim();
                }
            });

            const results = [
                ...textFields.filter((input) => input.name !== "reference").map(validateInput),
                validateGender(),
                validateDeclaration(),
            ];

            if (results.includes(false)) {
                const firstInvalid =
                    form.querySelector(".admission-field.is-invalid .admission-field__input, .admission-field.is-invalid input");
                firstInvalid?.focus();
                setStatus("Please fix the highlighted fields.", true);
                return;
            }

            const firstName = (form.elements.namedItem("fullName")?.value || "").trim().split(/\s+/)[0];

            submitBtn?.classList.add("is-loading");
            submitBtn?.setAttribute("aria-busy", "true");
            if (submitBtn) submitBtn.disabled = true;
            if (submitLabel) submitLabel.textContent = "Submitting...";
            setStatus("", false);

            // Mock request: replace with a real fetch() to your admissions endpoint.
            window.setTimeout(() => {
                submitBtn?.classList.remove("is-loading");
                submitBtn?.removeAttribute("aria-busy");
                if (submitBtn) submitBtn.disabled = false;
                if (submitLabel) submitLabel.textContent = defaultLabel;

                form.reset();
                fields.forEach((input) => input.removeAttribute("aria-invalid"));
                form.querySelectorAll(".admission-field.is-invalid").forEach((field) => {
                    field.classList.remove("is-invalid");
                    const errorEl = field.querySelector(".admission-field__error");
                    if (errorEl) errorEl.textContent = "";
                });

                setStatus(
                    `Thank you${firstName ? `, ${firstName}` : ""}! Your admission application has been submitted. Our team will contact you soon.`,
                    false
                );
            }, MOCK_SEND_DELAY);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAdmissionForm);
    } else {
        initAdmissionForm();
    }
})();
