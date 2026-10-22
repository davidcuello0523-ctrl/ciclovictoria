// =========================================================
// CicloVictoria · login.js
// Página de inicio de sesión: logo animado, validación,
// bloqueo tras 5 intentos, "Recordarme" y recuperar contraseña.
// =========================================================

import { iniciarSesion, obtenerSesion, esAdmin, estadoBloqueo, recuperarContrasena } from "./auth.js";
import { crearIconoBici, icono } from "./ui.js";

const $ = s => document.querySelector(s);
const form = $("#form-login");
const campoUsuario = $("#usuario");
const campoContrasena = $("#contrasena");
const mensajeError = $("#login-error");
const botonIngresar = $("#boton-ingresar");
const botonVer = $("#ver-contrasena");

// Si ya hay un administrador conectado, va directo al panel
if (esAdmin(obtenerSesion())) window.location.replace("admin.html");

// Bicicleta que se dibuja trazo a trazo
$("#logo-animado").replaceWith(crearIconoBici({ animado: true }));

// Mostrar / ocultar contraseña
botonVer.append(icono("ojo"));
botonVer.addEventListener("click", () => {
  const visible = campoContrasena.type === "text";
  campoContrasena.type = visible ? "password" : "text";
  botonVer.setAttribute("aria-pressed", String(!visible));
  botonVer.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
  botonVer.replaceChildren(icono(visible ? "ojo" : "ojoTachado"));
});

/** Sacude el formulario y muestra el error */
function mostrarError(texto) {
  mensajeError.classList.remove("exito");
  mensajeError.textContent = texto;
  form.classList.remove("sacudir");
  void form.offsetWidth;
  form.classList.add("sacudir");
}

/** Cuenta regresiva mientras dura el bloqueo */
let temporizador = null;
function bloquearFormulario(segundos) {
  clearInterval(temporizador);
  botonIngresar.disabled = true;
  let restantes = segundos;
  const pintar = () => { botonIngresar.textContent = `Espera ${restantes} s`; };
  pintar();
  temporizador = setInterval(() => {
    restantes--;
    if (restantes <= 0) {
      clearInterval(temporizador);
      botonIngresar.disabled = false;
      botonIngresar.textContent = "Ingresar";
      mensajeError.textContent = "";
      return;
    }
    pintar();
  }, 1000);
}

// Si al cargar sigue bloqueado (recargó la página), se mantiene la cuenta
const bloqueo = estadoBloqueo();
if (bloqueo.bloqueado) {
  mensajeError.textContent = "Demasiados intentos fallidos. Espera un momento.";
  bloquearFormulario(bloqueo.segundosRestantes);
}

form.addEventListener("submit", async evento => {
  evento.preventDefault();
  const usuario = campoUsuario.value.trim();
  const contrasena = campoContrasena.value;
  if (!usuario || !contrasena) {
    mostrarError("Escribe tu usuario y tu contraseña.");
    (usuario ? campoContrasena : campoUsuario).focus();
    return;
  }
  botonIngresar.disabled = true;
  try {
    const resultado = await iniciarSesion(usuario, contrasena, $("#recordarme").checked);
    if (resultado.ok) {
      botonIngresar.textContent = `¡Hola, ${resultado.sesion.nombre.split(" ")[0]}!`;
      window.location.href = "admin.html";
      return;
    }
    mostrarError(resultado.error);
    campoContrasena.value = "";
    campoContrasena.focus();
    if (resultado.bloqueado) {
      bloquearFormulario(resultado.segundos);
      return;
    }
  } catch (error) {
    mostrarError(error.message);
  }
  botonIngresar.disabled = false;
});

// ---------- ¿Olvidaste tu contraseña? ----------
const formRecuperar = $("#form-recuperar");
const errorRecuperar = $("#rec-error");
const botonRecuperar = $("#boton-recuperar");

function mostrarFormulario(recuperar) {
  form.hidden = recuperar;
  formRecuperar.hidden = !recuperar;
  mensajeError.textContent = "";
  errorRecuperar.textContent = "";
  if (recuperar) {
    $("#rec-usuario").value = campoUsuario.value.trim();
    ($("#rec-usuario").value ? $("#rec-codigo") : $("#rec-usuario")).focus();
  } else {
    campoUsuario.focus();
  }
}
$("#ir-recuperar").addEventListener("click", () => mostrarFormulario(true));
$("#volver-login").addEventListener("click", () => mostrarFormulario(false));

formRecuperar.addEventListener("submit", async evento => {
  evento.preventDefault();
  errorRecuperar.textContent = "";
  const usuario = $("#rec-usuario").value.trim();
  const codigo = $("#rec-codigo").value;
  const nueva = $("#rec-nueva").value;
  if (!usuario || !codigo.trim() || !nueva) { errorRecuperar.textContent = "Completa todos los campos."; return; }
  if (nueva !== $("#rec-repetir").value) { errorRecuperar.textContent = "Las contraseñas nuevas no coinciden."; return; }
  botonRecuperar.disabled = true;
  try {
    const resultado = await recuperarContrasena(usuario, codigo, nueva);
    if (resultado.ok) {
      formRecuperar.reset();
      mostrarFormulario(false);
      campoUsuario.value = usuario;
      campoContrasena.focus();
      mensajeError.textContent = "Contraseña cambiada. Ya puedes ingresar con la nueva.";
      mensajeError.classList.add("exito");
      botonRecuperar.disabled = false;
      return;
    }
    errorRecuperar.textContent = resultado.error;
    if (resultado.bloqueado) bloquearFormulario(resultado.segundos);
  } catch (error) {
    errorRecuperar.textContent = error.message;
  }
  botonRecuperar.disabled = false;
});
