---
name: comfyui-custom-node-engineering
description: >-
  Build, review, migrate, debug, test, document and publish production-grade
  ComfyUI custom nodes and frontend extensions using current official Comfy Org
  APIs, execution semantics, Registry standards and compatibility practices.
  Use this skill whenever a task involves ComfyUI custom nodes, node packs,
  model integrations, frontend extensions, server routes, workflow templates,
  Registry packaging or V1-to-V3 migration.
version: '2026-09-11'
---

# ComfyUI Custom Node Engineering

## Mission

When working on a ComfyUI custom node, produce code that is:

* compatible with current ComfyUI;
* graph-native rather than fighting the execution engine;
* cache-aware;
* VRAM/RAM/device aware;
* interoperable with other extensions;
* conservative about private APIs;
* secure enough for Registry distribution;
* documented and testable;
* maintainable across future ComfyUI releases.

ComfyUI evolves quickly.

**Never implement a ComfyUI integration from memory alone when the current official source can be inspected.**

---

# 1. Mandatory source check before coding

Before writing or modifying code, inspect the official sources relevant to the task.

Priority order:

1. ComfyUI Core
   https://github.com/Comfy-Org/ComfyUI

2. Current stable release
   https://github.com/Comfy-Org/ComfyUI/releases

3. Official docs
   https://docs.comfy.org/
   https://github.com/Comfy-Org/docs

4. Public versioned API
   `ComfyUI/comfy_api/`

5. Official V3 example
   `ComfyUI/custom_nodes/example_node.py.example`

6. Frontend
   https://github.com/Comfy-Org/ComfyUI_frontend

7. Manager
   https://github.com/Comfy-Org/ComfyUI-Manager

8. Registry
   https://registry.comfy.org/
   https://docs.comfy.org/registry/

9. Official Comfy Skills
   https://github.com/Comfy-Org/comfy-skills

10. Platform / Cloud
    https://comfy.org/platform
    https://support.comfy.org/

11. The target custom-node repository itself.

12. Current issues / PRs affecting the API being used.

Before coding, determine:

* current stable ComfyUI version;
* target ComfyUI version;
* bundled/required Frontend version;
* whether a public `comfy_api` API exists;
* whether Core already implements a similar node;
* whether an official Frontend API exists;
* whether an existing Registry node already solves the problem;
* whether the feature targets Local/Desktop, Cloud, Developer Platform, or several environments;
* whether there are current regressions/issues affecting the chosen API.

Do not assume today's API remains current.

---

# 2. Snapshot when this skill was authored

Research date:

**2026-09-11**

At this point:

* current stable Core: `v0.35.0`;
* Nodes V3 is the forward-looking custom-node schema;
* V1 remains supported;
* the official example uses `comfy_api.latest`;
* the public API is still evolving;
* `comfy_api.latest` is marked `STABLE = False`;
* `v0_0_2` is also marked non-stable at this snapshot;
* `v0_0_1` is marked stable but its own source explicitly says it exists as a template and should not normally be used.

Therefore:

**Never infer API maturity solely from the namespace name.**

Before each release inspect:

```text
comfy_api/version_list.py
comfy_api/latest/
comfy_api/v*/
```

and the current migration documentation.

---

# 3. V3 vs V1 decision

## New node

Prefer **V3** unless a verified compatibility requirement forces V1.

## Existing V1 project

Do not rewrite to V3 merely because V3 exists.

Migrate when it:

* enables a required feature;
* fixes a compatibility problem;
* meaningfully reduces technical debt;
* can preserve existing workflow contracts.

For a small bug in a mature V1 pack, a small V1 patch may be safer than a broad migration.

## Preserve workflow compatibility

Treat these as public contracts:

* node ID;
* mapping/class registration ID;
* input names;
* input types;
* output order;
* output types;
* custom datatype names;
* serialized widget behavior;
* server route names;
* Frontend setting IDs;
* custom WebSocket event names.

Visible display names may change more safely than serialized IDs.

---

# 4. Canonical V3 node

Use the current public schema.

```python
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io


class MajoorInvert(io.ComfyNode):

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MajoorInvert",
            display_name="Invert Image",
            category="Majoor/Image",
            description="Invert an RGB image.",
            inputs=[
                io.Image.Input("image"),
            ],
            outputs=[
                io.Image.Output(display_name="image"),
            ],
        )

    @classmethod
    def execute(cls, image) -> io.NodeOutput:
        return io.NodeOutput(1.0 - image)


class MajoorExtension(ComfyExtension):

    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            MajoorInvert,
        ]


async def comfy_entrypoint() -> MajoorExtension:
    return MajoorExtension()
```

For released code, do not blindly use `latest`.

First inspect which numbered/public API version actually supports the required features and what minimum Comfy version it requires.

If `latest` is necessary:

* state that explicitly;
* set an appropriate `requires-comfyui`;
* test against current stable ComfyUI;
* review compatibility on each release.

---

# 5. V3 schema

Inspect the current `io.Schema` definition before use.

Important concepts currently include:

```text
node_id
display_name
category
description
inputs
outputs
hidden
search_aliases
is_output_node
is_input_list
is_deprecated
is_experimental
is_dev_only
is_api_node
not_idempotent
enable_expand
accept_all_inputs
```

Do not invent schema fields.

Do not copy parameters from an old blog post without checking current source.

---

# 6. V3 types

Prefer explicit `io` types.

Common examples:

```text
io.Int
io.Float
io.String
io.Boolean
io.Combo

io.Image
io.Mask
io.Latent

io.Conditioning
io.Model
io.CLIP
io.VAE

io.Custom
```

The public API also exposes newer media and 3D concepts.

Current `comfy_api.latest` includes public concepts for:

```text
Image
Audio
Mask
Latent
Video

VideoFromFile
VideoFromComponents

VideoCodec
VideoContainer
VideoComponents

MESH
VOXEL
SPLAT
File3D
```

Always inspect the current version before using them.

---

# 7. Important V3 mechanisms

Use the official mechanisms where appropriate:

```text
io.Schema
io.NodeOutput
io.Autogrow
io.MatchType
io.Custom
ComfyExtension
comfy_entrypoint
fingerprint_inputs
check_lazy_status
validate_inputs
```

Prefer first-class V3 dynamic-input mechanisms over legacy arbitrary-dictionary tricks.

---

# 8. V1 compatibility reference

V1 remains important for existing packs.

```python
class MajoorInvert:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    FUNCTION = "execute"
    CATEGORY = "Majoor/Image"

    def execute(self, image):
        return (1.0 - image,)


NODE_CLASS_MAPPINGS = {
    "MajoorInvert": MajoorInvert,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MajoorInvert": "Invert Image",
}
```

Important V1 concepts:

```text
INPUT_TYPES
RETURN_TYPES
RETURN_NAMES
FUNCTION
CATEGORY
OUTPUT_NODE
INPUT_IS_LIST
OUTPUT_IS_LIST
VALIDATE_INPUTS
IS_CHANGED
NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS
WEB_DIRECTORY
```

One output still requires a tuple:

```python
RETURN_TYPES = ("IMAGE",)
return (image,)
```

No output:

```python
RETURN_TYPES = ()
return ()
```

---

# 9. V1 → V3 mapping

Use this conceptual mapping:

| V1                   | V3                   |
| -------------------- | -------------------- |
| `INPUT_TYPES`        | Schema `inputs`      |
| `RETURN_TYPES`       | Schema `outputs`     |
| `RETURN_NAMES`       | Output display names |
| `FUNCTION`           | `execute`            |
| `CATEGORY`           | Schema `category`    |
| `OUTPUT_NODE`        | `is_output_node`     |
| `DEPRECATED`         | `is_deprecated`      |
| `EXPERIMENTAL`       | `is_experimental`    |
| `VALIDATE_INPUTS`    | `validate_inputs`    |
| `IS_CHANGED`         | `fingerprint_inputs` |
| mapping dictionaries | `ComfyExtension`     |
| class registration   | `get_node_list()`    |

Preserve behavior during migration.

Do not combine migration with unrelated architecture changes unless requested.

---

# 10. Current V3 inheritance warning

Before creating V3 class hierarchies, inspect current Core issues.

At this skill's 2026-09-11 snapshot, an open issue reports that subclasses of `io.ComfyNode` can inherit cached schema-derived return metadata from their parent.

A child overriding its output schema may therefore expose one schema to `/object_info` while validation still sees the parent's cached return types.

Until verified fixed in the target release:

* avoid V3 inheritance when subclasses change output types/order;
* prefer composition/helper functions;
* test every subclass independently;
* verify both `/object_info` and real graph execution;
* re-check current issue status before applying any workaround.

Current issue at snapshot:

```text
Comfy-Org/ComfyUI #16132
```

Temporary Core bugs must not become permanent project architecture.

---

# 11. Tensor contracts

## IMAGE

Comfy images are normally:

```text
[B, H, W, C]
```

Usually:

```text
C = 3
```

They are **channel-last**.

Many PyTorch/vision libraries expect:

```text
[B, C, H, W]
```

Convert deliberately and restore the Comfy contract before returning.

---

## MASK

The safe rule is:

Do not assume rank.

Common shapes include:

```text
[H, W]
[B, H, W]
```

Official documentation has contained inconsistent MASK shape descriptions over time, so robust code should inspect `mask.ndim`.

Do not casually add/remove dimensions.

When converting a mask for image-style operations, the channel dimension is commonly added with:

```python
mask = mask.unsqueeze(-1)
```

when appropriate.

---

## LATENT

A latent is a dictionary.

Usually:

```python
latent["samples"]
```

contains:

```text
[B, C, H, W]
```

LATENT is normally channel-first.

Do not assume all modern model families use exactly four channels.

Do not discard additional latent dictionary fields without a reason.

Prefer:

```python
result = latent.copy()
result["samples"] = new_samples
```

when preserving metadata is required.

---

## AUDIO

Typical structure:

```python
{
    "waveform": tensor,   # [B, C, T]
    "sample_rate": 44100,
}
```

Preserve channel and sample-rate semantics.

---

# 12. Tensor safety

Always consider:

```text
shape
rank
batch
channels
dtype
device
value range
memory ownership
```

Never use:

```python
if tensor:
```

for a multi-element tensor.

Use:

```python
if tensor is not None:
```

Avoid generic:

```python
tensor.squeeze()
```

when batch size 1 may exist.

Prefer dimension-specific operations.

Never return accidentally squeezed output simply because one batch happened to contain one image.

---

# 13. Lists are not batches

Comfy's execution engine uses Python lists internally.

This is separate from tensor batches.

Example:

```text
list[IMAGE]
```

is not the same thing as:

```text
IMAGE tensor [B,H,W,C]
```

V1 uses:

```python
INPUT_IS_LIST = True
OUTPUT_IS_LIST = (...)
```

when a node wants direct list semantics.

Do not use list behavior to emulate image batching.

Do not use image batching to emulate graph list execution.

For V3, inspect the current schema/list API instead of mechanically carrying V1 flags forward.

---

# 14. Required / optional / hidden inputs

Use `required` only when execution cannot make sense without the value.

Use `optional` when absence is a legitimate state.

Do not fake optionality with arbitrary placeholder values.

Legacy hidden inputs include:

```text
UNIQUE_ID
PROMPT
EXTRA_PNGINFO
DYNPROMPT
```

Typical uses:

```text
UNIQUE_ID
→ node/server communication

PROMPT
→ submitted graph information

EXTRA_PNGINFO
→ output metadata

DYNPROMPT
→ advanced dynamic graph/expansion behavior
```

Use hidden graph-wide information sparingly.

---

# 15. Input validation

Validation should happen at real boundaries and return useful messages.

V1 `VALIDATE_INPUTS` must return:

```python
True
```

or an explanatory error string.

Important:

Inputs explicitly requested by a V1 validator can bypass normal backend validation for those inputs.

`**kwargs` can broadly disable default validation.

`input_types` transfers type-validation responsibility to your validator.

Therefore do not accidentally replace Comfy's validators with:

```python
return True
```

for everything.

---

# 16. Lazy evaluation

Use lazy evaluation whenever an input branch may not be needed.

Good candidates:

```text
Switch nodes
Conditional model loaders
Optional preprocessing
Zero-weight model merges
Disabled outputs
Alternative control branches
```

V1:

```python
"image_a": ("IMAGE", {"lazy": True})
```

plus:

```python
def check_lazy_status(...):
    return ["image_a"]
```

V3 has equivalent lazy semantics through the current schema.

The lazy-status method may be called repeatedly while the engine resolves required branches.

Do not execute every expensive upstream path and then throw most of it away.

---

# 17. ExecutionBlocker

`ExecutionBlocker` exists for intentional graph blocking.

Use it when propagation of the blocked state is desired.

Do not use it as a lazy-evaluation replacement.

If disabling your own output node, lazy evaluation is usually cleaner.

---

# 18. Caching

ComfyUI intentionally executes only graph sections whose effective state changed.

Respect this.

## Deterministic node

Normally rely on default caching.

## Random node

Expose a seed whenever possible.

Do not hide uncontrolled randomness inside an apparently deterministic node.

## External file/resource

When output can change while the widget/path stays the same, fingerprint the external state.

V1:

```python
IS_CHANGED
```

V3:

```python
fingerprint_inputs
```

The returned value is a fingerprint.

It is **not a boolean question**.

Do not do this:

```python
return True
```

to mean:

```text
"yes, changed"
```

because equal fingerprints can result in cache reuse.

Prefer hashes/version tokens/meaningful file metadata.

---

# 19. Non-idempotent nodes

Do not defeat caching unless side effects genuinely require it.

For V3 inspect:

```text
not_idempotent
```

and the current caching API.

Avoid carrying forward the legacy `float("NaN")` always-rerun trick into new V3 code unless current documentation explicitly requires it.

---

# 20. Output nodes

Mark a node as an output node only when it is truly a sink or side-effect boundary.

Examples:

```text
Save
Export
Send
Upload
Write
Final Preview
```

Do not make ordinary processors output nodes merely to force them to execute.

Fix the actual cache/execution contract.

---

# 21. Node Expansion

Use Node Expansion when a custom node should generate a graph/subgraph.

Typical uses:

```text
loops
conditional graph construction
reusable graph-native compositions
delegation to existing nodes
```

Prefer:

```python
GraphBuilder
```

from Comfy execution utilities rather than manually assembling graph dictionaries.

Expanded node IDs must be:

```text
unique
deterministic
stable across partial execution
```

Passing literal large tensors into expanded subgraphs can reduce cache effectiveness.

Prefer graph links when possible.

Do not call another node's `execute()` directly when graph expansion is the correct semantic operation.

---

# 22. Dynamic inputs

Old node packs sometimes use:

```text
wildcard "*"
ContainsAnyDict
arbitrary optional kwargs
frontend-generated sockets
```

These remain relevant for compatibility.

For a new V3 node, first investigate:

```text
io.Autogrow
io.MatchType
custom io types
current dynamic-schema support
```

Prefer first-class graph semantics.

---

# 23. Public `comfy_api`

Prefer the versioned public API whenever the needed capability exists.

Current public concepts include:

```text
ComfyAPI
ComfyAPISync
ComfyExtension
io / IO
ui / UI

Input
InputImpl
Types
Caching
```

Current `ComfyAPI` also exposes areas such as:

```text
execution progress
node replacement
external cache providers
```

Do not import underscore-prefixed implementation modules as your public contract.

---

# 24. Execution progress

For long operations, prefer the public progress API.

Current API provides a concept equivalent to:

```python
ComfyAPI.execution.set_progress(...)
```

with support for values/max values and optional preview images.

Progress updates must:

* represent real progress;
* avoid flooding the frontend;
* avoid expensive preview conversion every tiny step;
* stop when execution stops.

Do not invent a second polling server when Comfy's execution API already covers the requirement.

---

# 25. External caching API

If building distributed/shared caching, inspect the public `Caching` API.

Current public concepts include:

```text
CacheProvider
CacheContext
CacheValue
register_provider
unregister_provider
```

Do not monkey-patch execution internals for cache interception if the public provider API can solve the problem.

Treat shared cache data as potentially sensitive.

---

# 26. Model / device / memory rules

Treat:

```text
dtype
device
VRAM
RAM
offloading
quantization
```

as correctness concerns.

## Never hard-code CUDA for a general node

Avoid:

```python
tensor.cuda()
model.cuda()
device = "cuda"
```

unless CUDA-only behavior is an explicit product requirement.

ComfyUI supports several accelerator families.

---

# 27. Follow Comfy memory management

Before implementing loading/offloading logic, inspect current Core.

Relevant current modules/patterns include:

```text
comfy.model_management
comfy.memory_management
comfy.quant_ops
Comfy Kitchen
current optimized attention
existing model-family loaders
```

These may be internal rather than guaranteed public APIs.

If using them:

* use the narrowest surface;
* follow an active Core implementation;
* set `requires-comfyui`;
* add compatibility tests.

Do not describe an internal helper as a stable API.

---

# 28. Never fight the memory manager

Avoid:

```text
persistent module-level GPU tensors
global model caches
unconditional device transfers
duplicate model instances
surprise float32 conversion
manual unloading fighting Comfy
CPU↔GPU ping-pong
```

Large temporary caches should belong to one:

```text
execution
forward
encode
decode
```

and be released when that call returns.

---

# 29. Preserve dtype/device

Prefer allocating directly on the correct:

```text
device
dtype
```

Do not create on CPU only to immediately move to GPU.

Do not cast every tensor to float32 “for safety”.

Do not cast optimized backend results back to input dtype unless the backend contract requires it.

---

# 30. Reuse optimized Core operations

Before implementing new math:

1. search current Core;
2. search Comfy Kitchen;
3. search `comfy.quant_ops`;
4. search fused/layout-specific operations;
5. reuse an existing operation if mathematically compatible;
6. implement a local fallback only when necessary.

Do not maintain a duplicate slower implementation merely because it was easier to write.

---

# 31. Model files

Do not assume current working directory.

Use Comfy path mechanisms.

Respect:

```text
models/
extra_model_paths.yaml
```

Do not silently scan the user's entire filesystem.

Do not store large model assets inside the custom-node source tree unless the project explicitly requires it.

---

# 32. Model downloading

Never download models during module import.

Never silently download large assets.

Downloads should be:

```text
explicit
user-authorized
documented
from a known source
```

When applicable document:

```text
size
license
destination
checksum
model version
```

No telemetry should piggyback on a model download.

---

# 33. Import-time behavior

Comfy imports custom nodes at startup.

Do not perform during import:

```text
model download
pip install
GPU allocation
large model initialization
network telemetry
destructive migration
background service startup
expensive filesystem scans
```

A failing import can disable the entire node pack.

Import should mostly:

```text
load Python definitions
register nodes
register necessary routes/extensions
```

---

# 34. Backend HTTP API

Current official server routes include important endpoints such as:

| Route                  | Purpose                     |
| ---------------------- | --------------------------- |
| `/ws`                  | real-time WebSocket         |
| `/features`            | capabilities                |
| `/extensions`          | frontend extensions         |
| `/models`              | model categories            |
| `/models/{folder}`     | models                      |
| `/workflow_templates`  | templates                   |
| `/upload/image`        | image upload                |
| `/upload/mask`         | mask upload                 |
| `/view`                | media view                  |
| `/system_stats`        | device/system information   |
| `/prompt` GET          | queue/execution information |
| `/prompt` POST         | submit workflow             |
| `/object_info`         | node schemas                |
| `/object_info/{node}`  | one node schema             |
| `/history`             | history                     |
| `/history/{prompt_id}` | execution result            |
| `/queue`               | queue management            |
| `/interrupt`           | stop execution              |
| `/free`                | release requested resources |
| `/userdata`            | user data                   |
| `/v2/userdata`         | structured user data        |

Before relying on exact behavior, inspect current:

```text
server.py
official server route documentation
```

---

# 35. API workflow submission

An API-format workflow submitted to:

```text
POST /prompt
```

is validated before entering the queue.

Handle both:

```text
prompt_id / queue success
```

and:

```text
error
node_errors
validation failure
```

Do not assume an HTTP response alone proves semantic workflow success.

---

# 36. Custom server routes

For browser → backend custom operations use the existing server.

Example:

```python
from aiohttp import web
from server import PromptServer

routes = PromptServer.instance.routes


@routes.post("/majoor/omnicam/action")
async def omnicam_action(request):
    data = await request.json()

    # Validate data here.

    return web.json_response({
        "ok": True,
    })
```

Frontend:

```javascript
import { api } from "../../scripts/api.js";

await api.fetchApi("/majoor/omnicam/action", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
});
```

Rules:

```text
namespace paths
validate every payload
sanitize filenames/paths
never expose arbitrary shell execution
return structured errors
avoid GPU inference directly inside aiohttp handlers
```

Generation work normally belongs in Comfy's execution graph.

---

# 37. WebSocket events

Current execution messages include:

```text
status
execution_start
execution_error
execution_interrupted
execution_cached
execution_success
executing
executed
progress
```

Important:

```text
executed
```

does not simply mean every node completed.

It is related to UI output messages.

Custom frontend listener:

```javascript
import { api } from "../../scripts/api.js";

api.addEventListener("majoor.omnicam.solve", (event) => {
    console.log(event.detail);
});
```

Legacy/server message:

```python
PromptServer.instance.send_sync(
    "majoor.omnicam.solve",
    {
        "node": node_id,
        "state": "done",
    },
)
```

Namespace custom events.

Prefer the newer public V3/UI API if it covers the same need.

---

# 38. Frontend extension loading

Only add frontend code when the normal node schema is insufficient.

Backend-only code is cheaper to maintain.

Export:

```python
WEB_DIRECTORY = "./web"
```

JS:

```javascript
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Majoor.OmniCam",
    async setup() {
        // ...
    },
});
```

Do not copy JS files into ComfyUI Core's `web/` folder.

Do not edit compiled Comfy frontend files.

---

# 39. Frontend hooks

Important official extension lifecycle hooks include:

```text
init
addCustomNodeDefs
getCustomWidgets
beforeRegisterNodeDef
registerCustomNodes
beforeConfigureGraph
nodeCreated
loadedGraphNode
afterConfigureGraph
setup
```

Use:

```text
beforeRegisterNodeDef
→ behavior shared by every instance of a node type

nodeCreated
→ instance-specific behavior

afterConfigureGraph
→ workflow has been loaded/configured

setup
→ extension-level listeners and final setup
```

Filter `beforeRegisterNodeDef` carefully.

It is invoked for node definitions beyond your own extension.

---

# 40. Monkey-patching policy

Do not monkey-patch when an official hook exists.

Deprecated examples include overwriting:

```javascript
LGraphCanvas.prototype.getCanvasMenuOptions
nodeType.prototype.getExtraMenuOptions
```

Use the official context menu API instead:

```javascript
getCanvasMenuItems(canvas) {
    return [...]
}

getNodeMenuItems(node) {
    return [...]
}
```

Prototype hijacking is a last resort.

If unavoidable:

* explain why;
* isolate it;
* call original behavior correctly;
* test against the current Frontend;
* expect maintenance.

---

# 41. Settings API

Register settings through the extension API.

```javascript
app.registerExtension({
    name: "Majoor.OmniCam",

    settings: [
        {
            id: "Majoor.OmniCam.preview.enabled",
            name: "Enable preview",
            type: "boolean",
            defaultValue: true,
        },
    ],
});
```

Read:

```javascript
app.extensionManager.setting.get(
    "Majoor.OmniCam.preview.enabled"
);
```

Write:

```javascript
await app.extensionManager.setting.set(
    "Majoor.OmniCam.preview.enabled",
    false
);
```

Supported settings include current forms such as:

```text
boolean
text
number
slider
combo
color
image
hidden
```

Namespace IDs.

Do not rename setting IDs merely to reorganize the Settings UI.

---

# 42. Commands / keybindings

Use the official registration surface.

```javascript
app.registerExtension({
    name: "Majoor.OmniCam.Commands",

    commands: [
        {
            id: "Majoor.OmniCam.openViewer",
            label: "Open OmniCam Viewer",
            function: () => openViewer(),
        },
    ],

    keybindings: [
        {
            combo: {
                key: "i",
                shift: true,
            },
            commandId: "Majoor.OmniCam.openViewer",
        },
    ],
});
```

Do not override Core-reserved keybindings.

Avoid browser-reserved combinations.

Command IDs must be unique.

---

# 43. Other frontend APIs to check

Before inventing custom UI infrastructure, inspect current official APIs for:

```text
Context Menu
Settings
Commands
Keybindings
Dialogs
Toast notifications
Top bar menus
Sidebar tabs
Bottom panel tabs
Selection toolbox
About-panel badges
Subgraphs
Extension hooks
```

Prefer Comfy's current UX/component patterns.

Avoid building an unrelated mini-framework over the canvas when an extension surface already exists.

---

# 44. Frontend interoperability

Extensions coexist.

Therefore:

```text
namespace extension names
namespace settings
namespace CSS
namespace routes
namespace custom events
```

Avoid:

```text
global CSS selectors
unfiltered node prototype changes
global keyboard interception
DOM polling when app state exists
permanent requestAnimationFrame loops
assuming extension load order
```

Throttle expensive callbacks.

Test workflows containing hundreds of nodes.

---

# 45. UI return data

Prefer:

```text
schema widgets
tooltips
io.NodeOutput
public UI helpers
```

before custom JS.

Legacy V1 can return:

```python
{
    "ui": {
        # ...
    },
    "result": (
        # ...
    ),
}
```

Do not put large binary data into JSON UI payloads.

Use Comfy media/output mechanisms.

---

# 46. Node help documentation

Custom nodes can provide Markdown help directly inside ComfyUI.

Use:

```text
WEB_DIRECTORY/
└── docs/
    ├── MyNode.md
    └── MyNode/
        ├── en.md
        ├── fr.md
        └── zh.md
```

Document:

```text
purpose
inputs
outputs
model requirements
constraints
VRAM implications
usage
known limitations
```

Provide useful tooltips even when a full help page exists.

---

# 47. Example workflows

Use:

```text
example_workflows/
```

Example:

```text
example_workflows/
├── basic.json
├── basic.jpg
├── advanced.json
└── advanced.jpg
```

These appear in ComfyUI's workflow template browser.

A non-trivial public node pack should normally ship at least one working example.

Do not ship:

```text
absolute local paths
private model paths
developer-only dependencies
```

---

# 48. Registry security

Current Registry standards explicitly prohibit:

```text
eval
exec
runtime pip installation through subprocess
code obfuscation
```

Also avoid:

```text
arbitrary shell execution
unrestricted filesystem APIs
unsafe path traversal
hidden telemetry
credential logging
modifying other node packs
silent background network activity
```

Custom node security is part of the product.

---

# 49. External API nodes

If a node calls a remote service:

* make the remote behavior explicit;
* use HTTPS;
* implement timeout;
* handle provider errors;
* avoid hidden retries that multiply cost;
* never print secrets;
* never upload media to an undeclared provider;
* respect cancellation where available;
* expose cost-bearing behavior clearly;
* use the provider's documented auth mechanism;
* avoid background tracking.

If Comfy already provides an official Partner/API node for that provider, investigate whether integration or reuse is better than duplicating it.

---

# 50. Dependencies

Prefer fewer dependencies.

Dependencies create:

```text
installation conflicts
supply-chain risk
startup cost
maintenance cost
platform incompatibility
```

Declare them through the supported packaging mechanism.

Do not do:

```python
subprocess.run(["pip", "install", ...])
```

from the node.

Do not mutate the user's Python environment during import.

---

# 51. Repository structure

Prefer a simple modular repository.

Example:

```text
my-node-pack/
├── __init__.py
├── nodes/
│   ├── __init__.py
│   ├── image.py
│   ├── video.py
│   └── utils.py
├── web/
│   ├── extension.js
│   └── docs/
├── example_workflows/
├── tests/
├── pyproject.toml
├── requirements.txt
├── .comfyignore
├── README.md
├── LICENSE
└── CHANGELOG.md
```

Do not make one 5000-line monolith.

Also do not create dozens of one-function files with no architectural benefit.

Organize by coherent responsibility.

---

# 52. `pyproject.toml`

Follow current Registry specification.

Conceptual example:

```toml
[project]
name = "majoor-omnicam"
version = "1.0.0"
description = "Camera and motion tools for ComfyUI"
license = { file = "LICENSE" }
requires-python = ">=3.12"
dependencies = []

[project.urls]
Repository = "https://github.com/MajoorWaldi/..."
Documentation = "https://github.com/MajoorWaldi/..."
"Bug Tracker" = "https://github.com/MajoorWaldi/.../issues"

[tool.comfy]
PublisherId = "..."
DisplayName = "Majoor OmniCam"
requires-comfyui = ">=..."
```

Do not copy the example's Python/Comfy version ranges blindly.

Use the ranges actually tested by the project.

Current Registry guidance recommends that `[project].name` itself not contain the word `ComfyUI`.

The GitHub repository name is a separate naming question.

---

# 53. Frontend version compatibility

If the extension requires a particular Frontend range, use the current documented:

```text
comfyui-frontend-package
```

dependency constraint mechanism.

Examples of reasons:

```text
new extension hook
new menu API
new widget
known frontend regression
```

Do not claim "works with all Frontends" if custom JS relies on a recent API.

---

# 54. Semantic versioning

Use:

```text
MAJOR
→ breaking workflow/API changes

MINOR
→ backward-compatible features

PATCH
→ backward-compatible fixes
```

If changing serialized node behavior incompatibly, a patch bump is not enough.

---

# 55. `.comfyignore`

Registry publishing can package git-tracked files.

Use `.comfyignore` for tracked development assets that should not ship.

Example:

```gitignore
tests/
design/
*.psd
.vscode/
```

Use `[tool.comfy].includes` when generated runtime assets such as `dist/` need to be force-included.

Commit `.comfyignore`.

---

# 56. Registry publishing

Preferred current workflow:

```bash
comfy node init
comfy node publish
```

CI publication can use the official Comfy publishing GitHub Action.

Store Registry credentials only in CI secrets.

Never commit publishing tokens.

Verify the packaged artifact rather than assuming the git tree equals what users receive.

---

# 57. Registry / verified / official terminology

Do not call every Registry node "certified".

Distinguish:

```text
Core node
→ bundled with ComfyUI Core

Comfy Org repository
→ maintained in Comfy-Org

Registry node
→ published on Comfy Registry

Registry-verified/security-cleared node
→ passed the current Registry verification process

Manager node
→ discoverable/installable through Manager

Cloud-supported node
→ maintained/preinstalled in Comfy Cloud
```

These are not equivalent.

---

# 58. Manager compatibility

For new packs, prefer Registry + standard dependency metadata.

Do not rely on legacy install scripts when normal packaging works.

A good pack should:

```text
install cleanly
update cleanly
disable cleanly
remove cleanly
not touch other custom nodes
```

Test installation in a fresh Comfy environment.

---

# 59. Cloud compatibility

Local compatibility does not imply Cloud compatibility.

At the 2026-09-11 snapshot, Comfy Cloud uses a managed set of custom nodes and ordinary users cannot directly upload arbitrary custom-node packages.

Therefore never say:

```text
"Registry published = Cloud compatible"
```

Check the current Cloud-supported node set.

Cloud policy may change, so re-check it.

---

# 60. Developer Platform compatibility

Comfy Developer Platform deploys workflows as production APIs.

A custom node used in such a workflow must still exist in the managed target environment.

Keep these concerns separated:

```text
node execution
workflow graph
deployment
API client
authentication
```

Do not bake Platform deployment assumptions into a generic local node unless the node is explicitly a Platform integration.

---

# 61. File operations

When reading/writing files:

* use Comfy's standard path conventions;
* sanitize filenames;
* block traversal;
* do not overwrite arbitrary paths silently;
* preserve metadata when relevant;
* make side effects explicit;
* expose generated outputs through normal Comfy mechanisms.

Never trust:

```text
../../...
```

or absolute browser-provided paths without validation.

---

# 62. Error handling

Good error:

```text
Model 'foo.safetensors' was not found in models/diffusion_models.
Expected a MiniMax H3 diffusion model.
```

Bad error:

```text
Something went wrong.
```

Errors should be:

```text
specific
actionable
local to the boundary
free of secrets
```

Do not catch broad exceptions merely to continue with corrupt state.

A clear failure is better than silent wrong output.

---

# 63. Logging

Do not normally log:

```text
full tensors
full workflow JSON
API tokens
auth headers
entire environment dumps
per-frame noise
```

Debug logging should be opt-in.

Remove temporary prints before release.

---

# 64. Performance priorities

Optimize in this order:

1. avoid unnecessary graph branches with lazy evaluation;
2. respect caching;
3. avoid duplicate model loading;
4. avoid device transfers;
5. preserve useful batching;
6. reuse optimized Comfy operations;
7. avoid needless PIL/NumPy/Torch conversions;
8. avoid frontend event-loop work;
9. profile before introducing persistent caches.

Do not solve a 5 ms computation by creating a 5 GB VRAM cache.

---

# 65. Frontend performance

Avoid:

```text
full graph scan on mousemove
DOM polling loops
permanent requestAnimationFrame loops
unthrottled resize observers
expensive onDraw logic
duplicate event listeners
```

Use:

```text
events
state
throttling
cleanup
visibility checks
```

Test with large workflows.

---

# 66. Minimum backend test matrix

Test:

```text
module import
node registration
/object_info/<node>
required input
optional input absent
invalid constant input
normal execution
cache reuse
fingerprint invalidation
lazy branches
batch = 1
batch > 1
list semantics if applicable
boundary values
primary GPU backend
CPU if claimed
output shape
output dtype
output type
```

Model-heavy nodes should additionally test:

```text
low-VRAM/offload path
model unload/reload
multiple consecutive executions
different resolutions
```

---

# 67. Real API workflow test

Create a minimal API-format workflow with:

```text
real inputs
the new node
a real output/save/preview sink
```

Submit:

```text
POST /prompt
```

Then verify:

```text
prompt validation
execution completion
/history/{prompt_id}
actual artifact/output
cache behavior on second run
```

Do not claim completion because a Python unit test passed.

A Comfy node must run inside Comfy.

---

# 68. Frontend test matrix

Test:

```text
node creation
connection
disconnection
widget changes
save workflow
reload workflow
copy/paste
undo/redo
context menu
theme
zoom
browser refresh
workflow switching
large graphs
```

Check browser console for:

```text
errors
deprecated API warnings
duplicate listeners
```

---

# 69. Install test

On a clean environment:

```text
install
restart
load example workflow
execute
update
restart
execute again
disable
remove
```

Do this before a public release.

---

# 70. Compatibility matrix

State only what was tested.

Consider:

```text
minimum Comfy version
current stable Comfy
current nightly/master if useful

Python version

Windows
Linux
macOS

CUDA
ROCm
MPS
XPU
CPU
other accelerators
```

A CUDA-only model node may say CUDA-only.

Honest constraints are better than fake portability.

---

# 71. CI

Recommended CI layers:

```text
syntax/import
unit tests
lint/typecheck if project uses them
package metadata
frontend build/typecheck
workflow smoke test
security checks
Registry package validation
```

For mature extensions test current stable ComfyUI regularly.

Optionally test master/nightly to discover future breakage early.

---

# 72. Core internal API policy

Sometimes a new model integration requires private `comfy.*` internals.

When unavoidable:

1. find the closest active Core implementation;
2. use the narrowest import;
3. avoid copying large Core subsystems;
4. preserve Comfy dtype/device/memory policy;
5. add compatibility tests;
6. set a realistic minimum Comfy version;
7. revisit when the public API gains the capability.

Never vendor ComfyUI merely to avoid version compatibility work.

---

# 73. Research before building

Before creating a new custom node:

1. search Core;
2. search Registry;
3. search official workflow templates;
4. inspect relevant maintained custom nodes;
5. inspect licenses;
6. compare UX and graph contracts;
7. decide whether to reuse, extend, contribute upstream, or build.

Do not duplicate a mature solution without a reason.

Do not copy third-party code without respecting its license.

---

# 74. Engineering style

Keep changes narrow.

Prefer:

```text
direct code
existing local patterns
small patches
few dependencies
clear names
real abstractions only
```

Avoid:

```text
generic AI-generated service layers
unnecessary managers/factories
vague helpers
comments restating code
broad rewrite during bug fix
unused configuration flags
defensive branches without real failure modes
```

Match the target repository's style.

---

# 75. Architecture boundaries

Keep responsibilities separated:

```text
node schema
tensor processing
model integration
file IO
external API
server routes
frontend
settings
persistence
publishing
```

Pass the narrowest useful data between them.

If one feature inexplicably requires edits across every layer of the project, reconsider the ownership model before continuing.

---

# 76. Recommended repository completion standard

A production-quality node pack should normally include:

```text
README
LICENSE
pyproject.toml
source modules
example workflow
node help docs
dependency declaration
compatibility statement
tests
release version
```

Frontend packs should additionally have:

```text
source/build separation
current Frontend compatibility
no console deprecations
```

---

# 77. Release checklist

Before declaring a release complete:

* [ ] Current Comfy stable version checked.
* [ ] Relevant official docs checked.
* [ ] Relevant public API adapter inspected.
* [ ] Current Frontend API checked.
* [ ] Existing Core/Registry implementations searched.
* [ ] Node IDs preserved.
* [ ] Inputs verified.
* [ ] Outputs verified.
* [ ] Optional inputs tested.
* [ ] Tensor shapes tested.
* [ ] Batches tested.
* [ ] Lists tested if applicable.
* [ ] Lazy behavior tested.
* [ ] Cache behavior tested.
* [ ] Fingerprint behavior tested.
* [ ] Device behavior tested.
* [ ] Dtype behavior tested.
* [ ] VRAM lifetime checked.
* [ ] No large persistent tensor leak.
* [ ] No import-time model download.
* [ ] No import-time package installation.
* [ ] No `eval`.
* [ ] No `exec`.
* [ ] No runtime pip subprocess.
* [ ] No obfuscation.
* [ ] Routes namespaced.
* [ ] Route payloads validated.
* [ ] Secrets never logged.
* [ ] Browser console clean.
* [ ] Deprecated monkey-patching removed where an API exists.
* [ ] Workflow save/reload tested.
* [ ] Example workflow tested.
* [ ] Help docs updated.
* [ ] README updated.
* [ ] `pyproject.toml` checked.
* [ ] `requires-comfyui` checked.
* [ ] Frontend constraint checked if needed.
* [ ] `.comfyignore` checked.
* [ ] Clean installation tested.
* [ ] Update tested.
* [ ] Registry metadata checked.
* [ ] License checked.
* [ ] Cloud claims checked.
* [ ] Current Core issues affecting used APIs checked.

---

# 78. Workflow for a new node

## Phase A — Research

Read the request.

Inspect the repository.

Inspect current official Comfy sources.

Search Core and Registry for similar nodes.

Determine target Core/Frontend versions.

Determine hardware/model constraints.

Determine Local vs Cloud/Platform requirements.

## Phase B — Contract

Define before coding:

```text
node ID
display name
category
inputs
outputs
optional values
custom data types
side effects
lazy branches
cache semantics
errors
model paths
frontend needs
route namespace
event namespace
```

## Phase C — Minimal backend

Build the smallest correct backend first.

Prefer V3.

Prefer public APIs.

Reuse current Core behavior.

Do not add custom UI until necessary.

## Phase D — Integration

Add only required extras:

```text
progress
previews
frontend
settings
server routes
events
workflow templates
help docs
```

## Phase E — Verification

Run the backend, API-workflow, frontend and install tests.

## Phase F — Packaging

Update:

```text
pyproject
dependencies
README
LICENSE
.comfyignore
example workflows
node docs
version
```

## Phase G — Release

Test from a clean environment.

Publish through the current official Registry process.

---

# 79. Workflow for debugging

When debugging a custom node:

1. reproduce on the exact Comfy version;
2. read startup/import console;
3. read browser console;
4. inspect `/object_info/<node>`;
5. inspect the submitted API workflow;
6. distinguish frontend serialization from backend execution;
7. distinguish list semantics from tensor batch;
8. distinguish cache reuse from missing execution;
9. inspect dtype/device/shape at the failing boundary;
10. check current Core issues;
11. create the smallest fix;
12. rerun minimal and realistic workflows.

Do not refactor half the repository before proving the root cause.

---

# 80. Workflow for V1 → V3 migration

1. Freeze existing behavior with tests/workflows.
2. Record all V1 mapping keys.
3. Record all inputs.
4. Record all output ordering.
5. Record hidden inputs.
6. Record list semantics.
7. Record lazy behavior.
8. Record `IS_CHANGED`.
9. Record frontend behavior.
10. Convert one node.
11. Preserve the node ID.
12. Replace inputs with `io.*`.
13. Replace outputs with Schema outputs.
14. Replace execution with classmethod `execute`.
15. Replace tuples/dict output with `io.NodeOutput`.
16. Replace `IS_CHANGED` with `fingerprint_inputs`.
17. Replace mapping dictionaries with `ComfyExtension`.
18. Replace old dynamic hacks with V3 APIs where possible.
19. Test `/object_info`.
20. Load old workflows.
21. Test execution.
22. Test cache.
23. Test lazy evaluation.
24. Check current V3 inheritance bugs.
25. Only then migrate the next node.

Do not delete V1 compatibility before old workflows have been tested.

---

# 81. NEVER list

Never:

```text
code from stale memory
rename a shipped node ID casually
hard-code CUDA in a portable node
install pip at runtime
use eval/exec
obfuscate code
download models during import
keep giant tensors globally
fight Comfy's memory manager
force all tensors to float32
monkey-patch when a hook exists
copy JS into Core web directories
confuse lists with batches
use bool as an IS_CHANGED fingerprint
mark everything OUTPUT_NODE
discard latent metadata blindly
log API keys
expose unrestricted filesystem routes
use unnamespaced settings/routes/events
claim Registry means Core
claim Registry means Cloud
call every Registry node certified
copy code without checking license
ship a complex node without an example workflow
claim success without executing a real graph
```

---

# 82. Official reference index

## ComfyUI Core

https://github.com/Comfy-Org/ComfyUI

https://github.com/Comfy-Org/ComfyUI/releases

https://github.com/Comfy-Org/ComfyUI/tree/master/comfy_api

https://github.com/Comfy-Org/ComfyUI/blob/master/custom_nodes/example_node.py.example

https://github.com/Comfy-Org/ComfyUI/blob/master/AGENTS.md

## Docs

https://docs.comfy.org/

https://github.com/Comfy-Org/docs

### Custom nodes

https://docs.comfy.org/custom-nodes/overview

https://docs.comfy.org/custom-nodes/v3_migration

https://docs.comfy.org/custom-nodes/backend/server_overview

https://docs.comfy.org/custom-nodes/backend/datatypes

https://docs.comfy.org/custom-nodes/backend/images_and_masks

https://docs.comfy.org/custom-nodes/backend/tensors

https://docs.comfy.org/custom-nodes/backend/more_on_inputs

https://docs.comfy.org/custom-nodes/backend/lazy_evaluation

https://docs.comfy.org/custom-nodes/backend/lists

https://docs.comfy.org/custom-nodes/backend/expansion

### Frontend

https://docs.comfy.org/custom-nodes/js/javascript_overview

https://docs.comfy.org/custom-nodes/js/javascript_hooks

https://docs.comfy.org/custom-nodes/js/context-menu-migration

https://docs.comfy.org/custom-nodes/js/javascript_settings

https://docs.comfy.org/custom-nodes/js/javascript_commands_keybindings

### Documentation/templates

https://docs.comfy.org/custom-nodes/help_page

https://docs.comfy.org/custom-nodes/workflow_templates

### Server

https://docs.comfy.org/development/comfyui-server/comms_overview

https://docs.comfy.org/development/comfyui-server/comms_routes

https://docs.comfy.org/development/comfyui-server/comms_messages

## Frontend repository

https://github.com/Comfy-Org/ComfyUI_frontend

## Registry / Manager

https://registry.comfy.org/

https://github.com/Comfy-Org/ComfyUI-Manager

https://docs.comfy.org/registry/publishing

https://docs.comfy.org/registry/specifications

https://docs.comfy.org/registry/standards

## Skills

https://github.com/Comfy-Org/comfy-skills

https://docs.comfy.org/agent-tools/skills

## Platform / Cloud

https://comfy.org/platform

https://support.comfy.org/

---

# 83. Definition of done

A ComfyUI custom-node task is not complete until:

1. current official sources were checked;
2. the code imports;
3. the node registers;
4. `/object_info` exposes the expected contract;
5. a real workflow validates;
6. a real workflow executes;
7. actual output is produced;
8. caching behaves correctly;
9. lazy semantics behave correctly where used;
10. device/dtype behavior is correct;
11. frontend console is clean;
12. workflow save/reload works;
13. dependencies install through supported mechanisms;
14. docs and example workflows match implementation;
15. Registry security rules are respected;
16. compatibility claims were actually tested.

**Evidence before assertion.**
