// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    getFunctions,
    httpsCallable,
    connectFunctionsEmulator,
} from "firebase/functions";
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCqpWAYaTE9KP9qnPtPOem3O9bptylVZXM",
    authDomain: "sushi-squad-attendance.firebaseapp.com",
    projectId: "sushi-squad-attendance",
    storageBucket: "sushi-squad-attendance.appspot.com",
    messagingSenderId: "750975490482",
    appId: "1:750975490482:web:5169808a8863ffde4eacab",
    measurementId: "G-73VG9NK115",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
console.debug(analytics);
const functions = getFunctions(app);
const logAttendance = httpsCallable(functions, "logAttendance");

if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    console.debug("connecting to emulator");
    connectFunctionsEmulator(functions, "localhost", 5001);
}

const toasterContainer = document.createElement("div");
toasterContainer.classList.add(
    "fixed",
    "pointer-events-none",
    "z-50",
    "top-0",
    "left-0",
    "right-0"
);
const toaster = document.createElement("div");
toaster.classList.add(
    "h-24",
    "w-48",
    "invisible",
    "-top-32",
    "m-auto",
    "transition-all",
    "duration-500",
    "ease-in-out",
    "bg-gray-700",
    "text-green-300",
    "text-xl",
    "font-medium",
    "flex",
    "items-center",
    "justify-center",
    "border-2",
    "border-green-600",
    "rounded-lg",
    "relative",
    "shadow-lg"
);
document.body.appendChild(toasterContainer);
toasterContainer.appendChild(toaster);

const showToast = (message: string) => {
    toaster.classList.remove("invisible", "-top-32");
    toaster.classList.add("visible", "top-8");
    toaster.innerText = message;
    setTimeout(() => {
        toaster.classList.remove("visible", "top-8");
        toaster.classList.add("invisible", "-top-32");
    }, 3500);
};

const setupAttendanceForm = () => {
    const resultElement = document.getElementById(
        "attendance-error"
    ) as HTMLDivElement;

    const form = document.getElementById("attendance-form") as HTMLFormElement;
    const button = document.getElementById(
        "attendance-submit"
    ) as HTMLButtonElement;

    form.onsubmit = function (ev) {
        const email = (
            document.getElementById("attendance-email") as HTMLInputElement
        ).value;
        const description = (
            document.getElementById("attendance-desc") as HTMLInputElement
        ).value;

        console.debug("Submitting attendance for", email);

        button.disabled = true;
        button.innerHTML = `
    <div class="loader" aria-label="loading">
      <svg class="h-6 w-6" version="1.1" id="loader-1" xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="40px" height="40px" viewBox="0 0 50 50"
        style="enable-background:new 0 0 50 50;" xml:space="preserve">
        <path fill="#000"
          d="M43.935,25.145c0-10.318-8.364-18.683-18.683-18.683c-10.318,0-18.683,8.365-18.683,18.683h4.068c0-8.071,6.543-14.615,14.615-14.615c8.072,0,14.615,6.543,14.615,14.615H43.935z">
          <animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 25 25"
            to="360 25 25" dur="0.6s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>`;
        logAttendance({ email, description })
            .then((result) => {
                console.debug("Attendance logged, response: ", result);
                showToast("Attendance logged!");
                form.reset();
                resultElement.classList.remove(
                    "h-8",
                    "scale-y-100",
                    "mt-4",
                    "opacity-100"
                );
                resultElement.classList.add(
                    "h-0",
                    "scale-y-0",
                    "mb-0",
                    "opacity-0"
                );
            })
            .catch((error) => {
                console.error("Error logging attendance", error);
                form.append();
                resultElement.classList.add(
                    "h-8",
                    "scale-y-100",
                    "mt-4",
                    "opacity-100"
                );
                resultElement.classList.remove(
                    "h-0",
                    "scale-y-0",
                    "mb-0",
                    "opacity-0"
                );
                resultElement.innerText = error.message;
            })
            .finally(() => {
                button.disabled = false;
                button.innerHTML = "Send";
            });

        ev.stopPropagation();
        return false;
    };
};

setupAttendanceForm();
