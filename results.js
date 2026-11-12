/* Results page: search form validation and status feedback. */
(() => {
    "use strict";

    function initResultsForm() {
        const form = document.querySelector("[data-results-form]");
        if (!form) return;

        const status = form.querySelector("[data-results-status]");
        const year = form.querySelector("#admission-year");
        const exam = form.querySelector("#exam-name");
        const roll = form.querySelector("#roll-no");
        const submitBtn = form.querySelector(".results-form__submit");

        const setStatus = (message, isError = false) => {
            if (!status) return;
            status.textContent = message;
            status.classList.toggle("is-error", Boolean(isError));
        };

        form.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!year.value) {
                setStatus("Please select an admission year.", true);
                year.focus();
                return;
            }

            if (!exam.value) {
                setStatus("Please select an examination.", true);
                exam.focus();
                return;
            }

            const rollNo = (roll.value || "").trim();
            if (!rollNo) {
                setStatus("Please enter your roll number.", true);
                roll.focus();
                return;
            }

            const defaultLabel = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.classList.add("is-loading");
            submitBtn.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Searching';
            setStatus("", false);

            window.setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.classList.remove("is-loading");
                submitBtn.innerHTML = defaultLabel;
                setStatus(
                    `No published result found for roll no. “${rollNo}” in the selected exam. Please verify your details or contact the examination cell.`,
                    true
                );
            }, 700);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initResultsForm);
    } else {
        initResultsForm();
    }
})();
