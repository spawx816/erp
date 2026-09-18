---
name: agentes-personalizados
description: >-
  Guía y procedimiento para crear, configurar e invocar agentes personalizados (custom agents)
  en Antigravity. Utiliza esta habilidad cuando el usuario o el flujo de trabajo requiera
  definir roles de agentes especializados, configurar sus herramientas, modelos o permisos,
  e invocarlos como agentes principales o subagentes en el proyecto.
---

# Habilidad: Agentes Personalizados (Custom Agents) en Antigravity

Esta habilidad documenta y estandariza la creación, configuración y ejecución de **Agentes Personalizados** en proyectos Antigravity (Antigravity 2.0, CLI e IDE), basándose en la especificación oficial de Antigravity.

---

## 1. ¿Qué son los Agentes Personalizados?

Los agentes personalizados son configuraciones modulares basadas en archivos Markdown con encabezado YAML (`frontmatter`). Permiten definir roles especializados con:
- **Instrucciones del sistema dedicadas** (evitan prompts monolíticos y saturación de la ventana de contexto).
- **Herramientas restringidas (`tools`)**: solo las herramientas que el rol necesita.
- **Habilidades seleccionadas (`skills`)**: subconjuntos de habilidades específicas.
- **Políticas de seguridad y ejecución controladas** (`commandExecutionPolicy`, `permissionMode`).
- **Simetría de ejecución**: pueden actuar como **agente principal (`mainAgent`)** o como **subagente delegado (`subagent`)**.

---

## 2. Ubicación de Almacenamiento

Los archivos de agentes se almacenan como archivos `.md` en una de las siguientes rutas según el alcance deseado:

| Alcance | Ruta | Propósito |
| :--- | :--- | :--- |
| **Proyecto / Workspace** *(Recomendado)* | `.agents/agents/<nombre-agente>.md` | Específico del repositorio. Se versiona en Git y está disponible para todo el equipo. |
| **Global del Usuario** | `~/.gemini/config/agents/<nombre-agente>.md` | Aplica a todos los proyectos y workspaces locales en la máquina del usuario. |

> **Nota:** Para mantener el proyecto autocontenido y reproducible por el equipo, crea siempre los agentes en `.agents/agents/` dentro de la raíz del proyecto.

---

## 3. Formato y Campos Soportados

Un agente personalizado consta de un encabezado YAML (`frontmatter`) seguido del cuerpo en Markdown con las instrucciones de comportamiento (`# Core Instructions`).

### Estructura General

```markdown
---
name: nombre-del-agente
description: Descripción clara del rol y casos de uso del agente.
model: flash
tools:
  - view_file
  - replace_file_content
  - run_command
skills:
  - skills/nombre-habilidad
mainAgent: true
subagent: true
permissionMode: acceptEdits
commandExecutionPolicy: auto
---

# Core Instructions
Aquí se definen las directivas principales, personalidad, restricciones y flujo de trabajo del agente.
```

### Detalle de Campos del Frontmatter

| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `name` | String | **Sí** | Identificador único en minúsculas y separado por guiones (ej. `dependency-modernizer`, `qa-auditor`). |
| `description` | String | **Sí** | Explica qué hace el agente. Es crucial para que el agente coordinador decida delegarle tareas cuando actúa como subagente. |
| `model` | String | No | Modelo que utilizará el agente (ej. `flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, etc.). |
| `tools` | List[String] | No | Lista explícita de herramientas a las que tiene acceso (ej. `view_file`, `replace_file_content`, `run_command`, `manage_task`). Reduce el ruido y el consumo de tokens. |
| `skills` | List[String] | No | Lista de rutas relativas a habilidades curadas requeridas para este rol (ej. `skills/package-upgrade-rules`). |
| `mainAgent` | Boolean | No | Si es `true`, el agente puede ser ejecutado directamente por el usuario como agente principal desde la UI o CLI. |
| `subagent` | Boolean | No | Si es `true`, puede ser invocado dinámicamente como subagente por un agente coordinador. |
| `permissionMode` | String | No | Nivel de permisos de ejecución (ej. `acceptEdits`, `bypassPermissions`). |
| `commandExecutionPolicy` | String | No | Política de ejecución de comandos por consola. Con `auto`, ejecuta comandos comunes/seguros de compilación o pruebas de forma autónoma, solicitando confirmación solo para acciones destructivas. |

---

## 4. Invocación y Ejecución

Antigravity proporciona **verdadera simetría** entre agente principal y subagente:

### A. Como Agente Principal (Main Agent)
1. **Desde la GUI de Antigravity 2.0 / IDE:**
   - Selecciona el agente desde el menú desplegable de selección de agentes en la interfaz gráfica.
2. **Desde la CLI de Antigravity (`agy`):**
   ```bash
   agy --agent nombre-del-agente
   ```

### B. Como Subagente (Subagent)
- Cuando `subagent: true` está habilitado, el agente coordinador del sistema puede descubrir y delegar tareas especializadas a este agente de manera autónoma, utilizando la descripción del frontmatter para evaluar su idoneidad.
- El agente opera en su propia ventana de contexto sin saturar la sesión principal.

---

## 5. Procedimiento para Crear un Nuevo Agente en este Proyecto

1. Asegurarse de que exista la carpeta del proyecto:
   `.agents/agents/`
2. Crear un archivo Markdown descriptivo:
   `.agents/agents/<nombre-del-agente>.md`
3. Incluir el bloque de frontmatter YAML con los campos correspondientes.
4. Redactar las instrucciones (`# Core Instructions`) con los pasos de validación y reglas específicas.
5. Verificar la sintaxis YAML y que los nombres de herramientas y habilidades enlazadas existan.
