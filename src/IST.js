import 'jspsych/css/jspsych.css'
import { initJsPsych } from "jspsych"
import instructions from "@jspsych/plugin-instructions"
import canvasKeyboardResponse from "@jspsych/plugin-canvas-keyboard-response"
import canvasButtonResponse from "@jspsych/plugin-canvas-button-response"
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response"
import htmlButtonResponse from "@jspsych/plugin-html-button-response"

import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import _ from "lodash";


import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js'
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';



// BUILD THE WHOLE MODULE HERE NOW 
let globalSettings
let xAxis = new THREE.Vector3(1, 0, 0)
let yAxis = new THREE.Vector3(0, 1, 0)
let zAxis = new THREE.Vector3(0, 1, 0)
let worldPointer = new THREE.Vector3(0, 0, 0.5);
let distance_vector = new THREE.Vector3(0, 0, 0)

let warningBox;
let warningBoxText;
let warningMessageText;

let materialTypes = ['blur', 'opaque', 'transparent']


let mouseSmoothing = 8.0;       // equivalent to mouse_smoothing
const targetRotation = {
    x: 0, // pitch
    y: 0  // yaw
};

// Clamp values (in radians)
const MIN_X = THREE.MathUtils.degToRad(-40);
const MAX_X = THREE.MathUtils.degToRad(60);

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

const BlurMaskShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "tBlur": { value: null },
        "mouse": { value: new THREE.Vector2(0.5, 0.5) },
        "aspect": { value: window.innerWidth / window.innerHeight },
        "radius": { value: 0.1 },
        "softness": { value: 0.01 },
        "maskColor": { value: new THREE.Color(0x000000) },
        "maskAlpha": { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tBlur;
        uniform vec2 mouse;
        uniform float aspect;
        uniform float radius;
        uniform float softness;
        uniform vec3 maskColor;
        uniform float maskAlpha;
        varying vec2 vUv;
    
        void main() {
            vec4 sharp = texture2D(tDiffuse, vUv);
            vec4 blurred = texture2D(tBlur, vUv);
            
            vec2 uv = vUv;
            vec2 m = mouse;
            uv.x *= aspect;
            m.x *= aspect;

            float dist = distance(uv, m);
            float mask = smoothstep(radius, radius - softness, dist);
            
            // Mix the blurred texture with a solid color
            vec3 tintedBlur = mix(blurred.rgb, maskColor, maskAlpha);
            
            // Mix between the sharp center and the tinted blurry outside
            gl_FragColor = vec4(mix(tintedBlur, sharp.rgb, mask), sharp.a);
        }
    `
};

const SolidColorMaskShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "mouse": { value: new THREE.Vector2(0.5, 0.5) },
        "aspect": { value: window.innerWidth / window.innerHeight },
        "radius": { value: 0.15 },
        "softness": { value: 0.1 },
        "maskColor": { value: new THREE.Color(0x000000) }
    },
    vertexShader: `
                varying vec2 vUv;
                void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
    fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 mouse;
                uniform float aspect;
                uniform float radius;
                uniform float softness;
                uniform vec3 maskColor;
                varying vec2 vUv;

                void main() {
                vec4 texel = texture2D(tDiffuse, vUv);
                
                // Aspect ratio correction
                vec2 uv = vUv;
                vec2 m = mouse;
                uv.x *= aspect;
                m.x *= aspect;

                float dist = distance(uv, m);
                
                // The mask: 1.0 inside the circle, 0.0 outside
                float mask = smoothstep(radius, radius - softness, dist);
                
                // Mix the scene with the solid color based on the mask
                gl_FragColor = vec4(mix(maskColor, texel.rgb, mask), texel.a);
                }
            `
};

const TransparentMaskShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "mouse": { value: new THREE.Vector2(0.5, 0.5) },
        "aspect": { value: window.innerWidth / window.innerHeight },
        "radius": { value: 0.15 },
        "softness": { value: 0.1 },
        "maskColor": { value: new THREE.Color(0x000000) },
        "maskAlpha": { value: 0.7 }
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 mouse;
    uniform float aspect;
    uniform float radius;
    uniform float softness;
    uniform vec3 maskColor;
    uniform float maskAlpha;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      
      // Fix aspect ratio for a perfect circle
      vec2 uv = vUv;
      vec2 m = mouse;
      uv.x *= aspect;
      m.x *= aspect;

      float dist = distance(uv, m);
      
      // Determine if we are inside (1.0) or outside (0.0) the circle
      float circleMask = smoothstep(radius, radius - softness, dist);
      
      // Create the tinted color (mixing the scene with the mask color)
      vec3 tintedColor = mix(texel.rgb, maskColor, maskAlpha);
      
      // If we are inside the circle, show the original texel. 
      // If outside, show the tinted color.
      gl_FragColor = vec4(mix(tintedColor, texel.rgb, circleMask), texel.a);
    }
  `
};

class InteractiveSearchToolbox {
    constructor(userSettings = null) {

        // Default settings
        globalSettings = {
            enableAmbientLighting: true,
            responsiveDisplaySize: true,
            enableHDRI: false,
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(globalSettings, userSettings)
        }

        this.loadingManager = new THREE.LoadingManager();
        this.loadedModels = [];
        this.loadedTextures = [];
        this.loadedEnvs = [];
        this.loadingScreen;
        this.backgroundColor = '#c7c7c7';


        this.scene;
        this.camera;
        this.renderer;
        this.enableLighting = true//this.enableLighting
        this.interactiveCanvas;
        this.stimuliInScene = []
        this.selectedObject = null
        this.helperControls = true

        this.mainComposer
        this.blurRT
        this.blurComposer
        this.finalPass
        this.hBlur
        this.vBlur
        
        this.mouseSensitivity = 0.002;
        
        this.blurSettings = {
            intensity: 1.5 // 1.0 is standard, 0.0 is no blur, 5.0+ is very heavy
        };


        // Interaction Controls variables
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.set(0);
        this.pointer = new THREE.Vector2();
        this.pointerDelta = new THREE.Vector2();
        this.previousPointer = new THREE.Vector2();
        this.delta = 0
        this.clock = new THREE.Clock();

        this.worldPosition = new THREE.Vector3()
        //this.zOffset = 5
        //this.zTarget = new THREE.Vector3()
        this.pointerDown = false;
        this.pointerUp = true;
        this.currentRaycastObject = null;
        this.checkStats = false
        //this.debugCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),new THREE.MeshBasicMaterial({ color: 0x00ff00 }));


        //this.orbitControls;
        this.dragToRotateEnabled = false
        this.orbitControlsEnabled = false
        this.dragControlsEnabled = false
        this.gazeContingentEnabled = false
        this.FPControlsEnabled = false
        this.currentMaskType = null


        this.gazeContingentControls;
        this.gazeContingentPlane;
        this.animationRequestID = null;

        this.objectsInScene = []

        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);
        this.stats.dom.style.display = 'none'

        document.body.style.margin = "0";

        this.setupLoadingScreen();
        this.turnOnLoadingScreen();

        this.setupWarningMessage();
        this.setupToolbox();
    }

    setValues(defaultSettings, newSettingsObj) {
        // If no data supplied, return.
        if (newSettingsObj === undefined) return;

        // For each key within the new settings object
        for (const key in newSettingsObj) {

            // Extract the data
            const new_data = newSettingsObj[key];

            // If new_data is empty warn
            if (new_data === undefined) {
                console.warn(`Parameter '${key}' has value of undefined.`);
                continue;
            }

            // Get the old data from the original settings object using the key from the new settings object
            const old_data = defaultSettings[key];

            // If the old data is undefined, that means
            if (old_data === undefined) {
                console.warn(`${key}' is not a recognisable setting parameter.`);
                continue;
            }

            // If the new_data is not null, replace the default setting
            if (new_data != null) {
                defaultSettings[key] = new_data;
            }
        }

    }

    setupToolbox() {
        // Check for dependencies first
        if (typeof jsPsych !== 'undefined') {
        } else {
            this.warningMessage('⚠️\njsPsych is not loaded.\nEnsure you have included the correct CDN!')
        }

        // Create and setup global scene object
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.backgroundColor);
        if (globalSettings.enableAmbientLighting == true) {
            const light = new THREE.AmbientLight(0x404040, 35); // soft white light
            this.scene.add(light);
        }

        // Setup global camera object
        this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.scene.add(this.camera)
        this.camera.layers.enableAll();

        // Setup gloval renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Setup controls
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.disableOrbitControls()
        this.disableDragControls()
        this.disableDragToRotateControls()
        this.disableGazeContingentControls()







        // Create pointer to the canvas threejs uses.
        this.interactiveCanvas = this.renderer.domElement;

        // Setup responsive display 
        if (globalSettings.responsiveDisplaySize == true) {
            window.addEventListener('resize', () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                this.renderer.setSize(w, h);
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();

                if (this.gazeContingentEnabled) {
                    if (this.maskType == 'blur') {
                        this.finalPass.uniforms.aspect.value = w / h;
                        this.blurComposer.render();
                        this.finalPass.uniforms.tBlur.value = this.blurRT.texture;
                    }
                    this.mainComposer.render();
                }
            })
        }

        // Setup pointer events
        window.addEventListener('pointerdown', (event) => {
            // If left button pressed
            if (event.button == 0) {
                // Raycast the scene 
                this.raycastScene()

                // Raycast will update a global variable - when the left mouse button is clicked, we select it
                this.selectedObject = this.currentRaycastObject;

                // Update pointer flags
                this.pointerDown = true;
                this.pointerUp = false;
            } else {
                return;
            }
        });

        // When button released
        window.addEventListener('pointerup', (event) => {

            // Reset currentRaycastObject
            this.currentRaycastObject = null;

            // Update pointer flags
            this.pointerUp = true;
            this.pointerDown = false;
        });

        // When the cursor is moved
        window.addEventListener('pointermove', (event) => {

            // calculate pointer position in normalized device coordinates
            // (-1 to +1) for both components
            this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;


            // Calculate pointer delta
            this.pointerDelta.x = this.pointer.x - this.previousPointer.x;
            this.pointerDelta.y = (this.pointer.y) - this.previousPointer.y;

            // Raycast the scene
            this.raycastScene()

            // Function that processes control code depending on which controls are enabled or disbaled
            this.handleControls(event)

            // Log pointer position for delta calculations
            this.previousPointer.x = this.pointer.x;
            this.previousPointer.y = this.pointer.y;
        });

        // If mouse leaves the screen, reset cursor variables
        document.addEventListener("pointerleave", (event) => {

            if (event.clientY <= 0 || event.clientX <= 0 || (event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) {
                this.currentRaycastObject = null;
                this.selectedObject = null;
            }
        });

        // Preload in default HDRI
        this.preloadDefaultHDRI('https://cdn.jsdelivr.net/gh/HadenDewis/InteractiveSearchToolbox@latest/toolbox_assets/smallStudio.hdr')

        // Attach other libraries as global objects 
        window.THREE = THREE
        window.jsPsych = initJsPsych();
        window.canvasKeyboardResponse = canvasKeyboardResponse
        window.canvasButtonResponse = canvasButtonResponse
        window.htmlKeyboardResponse = htmlKeyboardResponse
        window.htmlButtonResponse = htmlButtonResponse
        window.instructions = instructions
        window._ = _
    }

    init() {
        this.interactiveCanvas.style.display = 'none';
        this.turnOffLoadingScreen();
    }

    // Show the FPS counter
    showDebugStats() {
        this.checkStats = true
        this.stats.dom.style.display = 'flex'
    }

    // Hide the FPS counter
    hideDebugStats() {
        this.checkStats = false
        this.stats.dom.style.display = 'none'
    }

    // Disable controls
    disableControls() {
        this.helperControls = false
    }

    // Enable controls
    enableControls() {
        this.helperControls = true
    }

    enableFirstPersonControls(sensitivity = null){
        this.disableOrbitControls()
        this.disableDragControls()
        this.disableDragToRotateControls()
        this.disableGazeContingentControls()
        
        xAxis.set(1,0,0)
        yAxis.set(0,1,0)
        zAxis.set(0,0,1)

        if(sensitivity != null){
            this.mouseSensitivity = sensitivity
        }
        
        this.FPControlsEnabled = true;
    }

    disableFirstPersonControls(){
        this.FPControlsEnabled = false;
    }


    // Call relevant control functions
    handleControls(event) {
        // If enabled and within the bounds of the screen
        if (this.helperControls) {
            if (this.pointer.length() <= 1.41) {
                switch (true) {
                    case this.dragControlsEnabled:
                        this.dragControls(event, this.selectedObject)
                        break;
                    case this.orbitControlsEnabled:
                        this.orbitControls.update()
                        break;
                    case this.dragToRotateEnabled:
                        this.dragToRotate(event, this.selectedObject);
                        break
                    case this.gazeContingentEnabled:
                        this.gazeContingent(event)
                        break
                    case this.FPControlsEnabled:
                        this.firstPersonControls(event)
                        break
                }
            }

        }
    }

    // Add a flag to enable and disable selecting parents
    raycastScene() {
        // Set raycast position and direction from the camera 
        this.raycaster.setFromCamera(this.pointer, this.camera);

        // calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObjects(this.stimuliInScene);

        // If we are intersecting an object...
        if (intersects.length > 0) {

            // Get the intersecting object
            const temp_selection = intersects[0].object

            // Loop through and select the top parent object of the intersecting object
            // This stops us from rotating/moving individual meshes within groups
            let keepChecking = true;
            while (keepChecking) {
                let parent = temp_selection.parent
                let grid_parent = temp_selection.grid_parent

                if (parent == this.scene || parent == grid_parent) {
                    keepChecking = false
                    break
                } else {
                    this.currentRaycastObject = parent;
                    break
                }
            }
        } else {
            this.currentRaycastObject = null
        }
    }

    // Drag controls allow us to drag and drop an object
    // Right now, this locks the objects z position to what it is before the interaction occurs. 
    dragControls(event, obj = null) {
        if (obj != null) {
            if (this.pointerDown) {
                let pos = this.mouseToWorld(obj.position)
                console.log(pos)
                obj.parent.worldToLocal(pos);
                obj.position.copy(pos);
            }
        }
    }

    // Drag to rotate controls rotate objects with mouse movements
    // Click and drag to the left to rotate to the left etc.
    dragToRotate(event, obj = null) {
        if (obj != null) {
            if (this.pointerDown) {
                //Allow the cube to rotate with mouse movements
                let xRotationAmount = (this.pointerDelta.x * 200) * this.delta;
                let yRotationAmount = ((this.pointerDelta.y * 200) * this.delta) * -1;

                // Camera-relative axes
                const cameraRight = xAxis.applyQuaternion(this.camera.quaternion);
                const cameraUp = yAxis.applyQuaternion(this.camera.quaternion);

                // Rotate relative to camera orientation
                obj.rotateOnWorldAxis(cameraUp, xRotationAmount);
                obj.rotateOnWorldAxis(cameraRight, yRotationAmount);

                xAxis.set(1, 0, 0) // Reset to default
                yAxis.set(0, 1, 0) // Reset to default
            }
        }
    }

    firstPersonControls(event){
        if(this.pointerDown){
            this.camera.rotateOnWorldAxis(yAxis, this.pointerDelta.x * this.mouseSensitivity);
            this.camera.rotateOnAxis(xAxis, this.pointerDelta.y * this.mouseSensitivity);
            
            xAxis.set(1, 0, 0) // Reset to default
            yAxis.set(0, 1, 0) // Reset to default
        }
    }




    gazeContingent(event, obj = null) {
        this.finalPass.uniforms.mouse.value.x = event.clientX / window.innerWidth;
        this.finalPass.uniforms.mouse.value.y = 1.0 - (event.clientY / window.innerHeight);
    }
    // Converts mouse position in pixels to a position within the 3D scene
    mouseToWorld(distanceTarget = null) {
        // distanceTarget determines how far away from the camera this position will be

        // Set world pointer to be x and y NDC 
        worldPointer.set(this.pointer.x, this.pointer.y, 0)

        // Convert NDC to world - This places the object at the position of the camera
        worldPointer.unproject(this.camera);

        // Subtract the camera position from it
        worldPointer.sub(this.camera.position).normalize();

        // Calculate how far away the object is 
        let distance
        if (distanceTarget == null) {
            // If no object provided, place the object at the zero point of the scene
            distance = this.camera.position.length()
        } else {
            // Else maintain its current distance
            distance = this.camera.position.distanceTo(distanceTarget)
        }

        // Add this distance to the coords
        worldPointer.multiplyScalar(distance)

        // Create final position
        this.worldPosition.copy(this.camera.position).add(worldPointer)//.multiplyScalar(distance));

        return (this.worldPosition);

    }

    // Find a object by name
    // The item has to be a threejs object
    findLoadedObject(name, arrayToSearch = null) {
        // If supplied with a specific array to search, it will do so 
        if (arrayToSearch != null) {
            return (arrayToSearch.find(obj => obj.name === name));
        } else {
            return (this.loadedModels.find(obj => obj.name === name));
        }
    }

    // Find a texture by name
    // The item has to be a threejs texture
    findLoadedTexture(name, arrayToSearch) {
        // If supplied with a specific array to search, it will do so 
        if (arrayToSearch != null) {
            return (arrayToSearch.find(obj => obj.name === name));
        } else {
            return (this.loadedTextures.find(obj => obj.name === name));
        }
    }


    // Build the loading screen
    setupLoadingScreen() {
        this.loadingScreen = document.createElement('div')
        this.loadingScreen.setAttribute('id', 'loadingScreen');

        this.loadingScreen.style.display = 'flex';
        this.loadingScreen.style.flexDirection = 'column';
        this.loadingScreen.style.gap = '15px';
        this.loadingScreen.style.position = 'absolute';
        this.loadingScreen.style.top = '0%';
        this.loadingScreen.style.width = '100vw';
        this.loadingScreen.style.zIndex = '1000';
        this.loadingScreen.style.height = '100vh';
        this.loadingScreen.style.backgroundColor = this.backgroundColor;
        this.loadingScreen.style.alignItems = 'center';
        this.loadingScreen.style.justifyContent = 'center';

        const loadingText = document.createElement('div')
        loadingText.setAttribute('id', 'loadingText');
        loadingText.innerText = 'Loading'

        const loader_style = document.createElement("style");
        loader_style.innerHTML = `
        .loader {
            width: 48px;
            height: 48px;
            display: inline-block;
            position: relative;
            transform: rotate(45deg);
            }
            .loader::before {
            content: '';  
            box-sizing: border-box;
            width: 24px;
            height: 24px;
            position: absolute;
            left: 0;
            top: -24px;
            animation: animloader 4s ease infinite;
            }
            .loader::after {
            content: '';  
            box-sizing: border-box;
            position: absolute;
            left: 0;
            top: 0;
            width: 24px;
            height: 24px;
            background: rgba(255, 255, 255, 0.85);
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
            animation: animloader2 2s ease infinite;
            }

            @keyframes animloader {
            0% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            12% {
                box-shadow: 0 24px white, 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            25% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            37% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px white, 0px 48px rgba(255, 255, 255, 0);
            }
            50% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px white, 0px 48px white;
            }
            62% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px white, 24px 48px white, 0px 48px white;
            }
            75% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px white, 0px 48px white;
            }
            87% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px white;
            }
            100% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            }

            @keyframes animloader2 {
            0% {
                transform: translate(0, 0) rotateX(0) rotateY(0);
            }
            25% {
                transform: translate(100%, 0) rotateX(0) rotateY(180deg);
            }
            50% {
                transform: translate(100%, 100%) rotateX(-180deg) rotateY(180deg);
            }
            75% {
                transform: translate(0, 100%) rotateX(-180deg) rotateY(360deg);
            }
            100% {
                transform: translate(0, 0) rotateX(0) rotateY(360deg);
            }
            }
        `
        document.head.appendChild(loader_style);


        const loader = document.createElement('span')
        loader.setAttribute('class', 'loader');


        this.loadingScreen.appendChild(loadingText);
        this.loadingScreen.appendChild(loader);
        document.body.appendChild(this.loadingScreen);
    }

    // BUG: Need to fix jitter - map it between 0 and 1 and make it work better with scaling issues.
    calculateGridPositionsInternal(settings) {
        let objectsToCheck

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            objectsToCheck = settings.stimuli
        } else {
            objectsToCheck = [settings.stimuli]
        }

        // If we have provided objects, pick the largest one for spacing
        if (objectsToCheck.length > 0) {
            // Create a vector to store the size
            const boundingBox = new THREE.Box3();
            let previousArea = 0
            const size = new THREE.Vector3();
            let finalSize = new THREE.Vector3();

            for (let i = 0; i < objectsToCheck.length; i++) {
                let obj = objectsToCheck[i]

                boundingBox.setFromObject(obj);
                boundingBox.getSize(size);

                let area = size.x * size.y

                if (previousArea < area) {
                    finalSize = size
                }

                previousArea = area
            }

            settings.itemWidth = size.x
            settings.itemHeight = size.y
        }

        let positions = []
        let nextEmptyPosition = 0

        // Total grid width and height
        // width of all columns + width of all spaces between columns
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;

        // height of all rows + height of all spaces between rows
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;

        // Calculate the area of the largest object (largest object is selected in previous step)
        let trueArea = settings.itemWidth * settings.itemHeight

        // Setup the grid object for debugging
        let debugGrid = new THREE.Group();
        debugGrid.layers.set(1); // So we can ignore it when raycasting 
        debugGrid.name = 'DEBUG_GRID_IGNORE';


        // Now calculate the actual positions within the grid - for each row go through each columns
        // For each row
        for (let row = 0; row < settings.rows; row++) {
            // For each column
            for (let col = 0; col < settings.columns; col++) {

                // Calculate the position of each box - centered around 0
                // Calculate where it should be along the x axis based on the current column it is, its width, and the set distance between columns
                // Calculate where it should be along the y axis based on the current column it is, its heigth, and the set distance between columns
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                // Apply the jitter (scaled to object size and randomly picks direction)
                let jitter = (settings.jitter * trueArea) * _.sample([-1, 1])

                // Calculate the position and create debug geometry
                let position = new THREE.Vector3(x + jitter, y + jitter, 0)
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set(1);
                debugGrid.add(plane)

                // Apply rotations to points based on which axis the camera has been translated along...
                switch (settings.cameraAxis) {
                    // Translated along X and looking at 0,0,0
                    case 'X':
                        position = position.applyAxisAngle(yAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateY(1.5708)
                        break
                    // Translated along Y and looking at 0,0,0
                    case 'Y':
                        position = position.applyAxisAngle(xAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateX(1.5708)
                        break
                    // Translated along Z and looking at 0,0,0
                    case 'Z':
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        break
                }
            }
        }

        this.scene.add(debugGrid)

        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }

        // Returns object that lists all positions, the next free empty slot, a pointer to the debug grid, and the number of rows and columns in the grid
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows: settings.rows, columns: settings.columns }
    }

    // BUG: Need to fix jitter - map it between 0 and 1 and make it work better with scaling issues.
    calculateGridPositions(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 0,
            cameraAxis: 'Z',
            showDebugGrid: false
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)

        let objectsToCheck

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            objectsToCheck = settings.stimuli
        } else {
            objectsToCheck = [settings.stimuli]
        }

        // If we have provided objects, pick the largest one for spacing
        if (objectsToCheck.length > 0) {
            // Create a vector to store the size
            const boundingBox = new THREE.Box3();
            let previousArea = 0
            const size = new THREE.Vector3();
            let finalSize = new THREE.Vector3();

            for (let i = 0; i < objectsToCheck.length; i++) {
                let obj = objectsToCheck[i]

                boundingBox.setFromObject(obj);
                boundingBox.getSize(size);

                let area = size.x * size.y

                if (previousArea < area) {
                    finalSize = size
                }

                previousArea = area
            }

            settings.itemWidth = size.x
            settings.itemHeight = size.y
        }

        let positions = []
        let nextEmptyPosition = 0

        // Total grid width and height
        // width of all columns + width of all spaces between columns
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;

        // height of all rows + height of all spaces between rows
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;

        // Calculate the area of the largest object (largest object is selected in previous step)
        let trueArea = settings.itemWidth * settings.itemHeight

        // Setup the grid object for debugging
        let debugGrid = new THREE.Group();
        debugGrid.layers.set(1); // So we can ignore it when raycasting 
        debugGrid.name = 'DEBUG_GRID_IGNORE';


        // Now calculate the actual positions within the grid - for each row go through each columns
        // For each row
        for (let row = 0; row < settings.rows; row++) {
            // For each column
            for (let col = 0; col < settings.columns; col++) {

                // Calculate the position of each box - centered around 0
                // Calculate where it should be along the x axis based on the current column it is, its width, and the set distance between columns
                // Calculate where it should be along the y axis based on the current column it is, its heigth, and the set distance between columns
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                // Apply the jitter (scaled to object size and randomly picks direction)
                let jitter = (settings.jitter * trueArea) * _.sample([-1, 1])

                // Calculate the position and create debug geometry
                let position = new THREE.Vector3(x + jitter, y + jitter, 0)
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set(1);
                debugGrid.add(plane)

                // Apply rotations to points based on which axis the camera has been translated along...
                switch (settings.cameraAxis) {
                    // Translated along X and looking at 0,0,0
                    case 'X':
                        position = position.applyAxisAngle(yAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateY(1.5708)
                        break
                    // Translated along Y and looking at 0,0,0
                    case 'Y':
                        position = position.applyAxisAngle(xAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateX(1.5708)
                        break
                    // Translated along Z and looking at 0,0,0
                    case 'Z':
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        break
                }
            }
        }

        this.scene.add(debugGrid)

        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }

        // Returns object that lists all positions, the next free empty slot, a pointer to the debug grid, and the number of rows and columns in the grid
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows: settings.rows, columns: settings.columns }
    }

    placeOnGrid(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            gridObject: null,
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 0,
            cameraAxis: 'Z',
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            showDebugGrid: false,
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)



        let parentObj = new THREE.Group();
        let objectsToPlace, gridObject;

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        objectsToPlace = settings.stimuli

        if (settings.gridObject == null) {
            settings.gridObject = this.calculateGridPositionsInternal(settings)
        }

        console.log(settings)


        if (objectsToPlace.length > settings.gridObject.positions.length) {
            this.warningMessage("⚠️\nNot enough grid positions for total objects to place.\nIncrease rows or columns parameter or reduce number of stimuli.")
            return
        }

        // Randomise grid positions
        settings.gridObject.positions = _.shuffle(settings.gridObject.positions)

        objectsToPlace.forEach(object => {
            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }
            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }

            let pos = settings.gridObject.positions[settings.gridObject.nextEmptyPosition]
            object.position.set(pos.x, pos.y, pos.z)
            settings.gridObject.nextEmptyPosition++

            object.grid_parent = parentObj;

            this.addStimulusToScene(object)
            parentObj.add(object)
        });

        parentObj.add(settings.gridObject.debugGrid)
        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    placeOnManualGrid(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            gridObject: {},
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            randomPlacement: false,
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)

        let parentObj = new THREE.Group();
        let objectsToPlace, gridObject;

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        objectsToPlace = settings.stimuli

        gridObject = settings.gridObject;

        if (objectsToPlace.length > gridObject.positions.length) {
            this.warningMessage("⚠️\nNot enough grid positions for total objects to place.\nIncrease rows or columns parameter or reduce number of stimuli.")
            return
        }


        if (settings.randomPlacement) {
            gridObject.positions = _.shuffle(gridObject.positions)
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                let pos = gridObject.positions[gridObject.nextEmptyPosition]
                object.position.set(pos.x, pos.y, pos.z)
                gridObject.nextEmptyPosition++

                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }
        if (settings.leftToRightTop) {
            // Row 1, col 1
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                object.position.set(gridObject.positions[gridObject.nextEmptyPosition].x, gridObject.positions[gridObject.nextEmptyPosition].y, gridObject.positions[gridObject.nextEmptyPosition].z)
                gridObject.nextEmptyPosition++
                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }
        if (settings.rightToLeftTop) {
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                // Determine current row and column
                let cols = gridObject.columns;
                let row = Math.floor(gridObject.nextEmptyPosition / cols);
                let col = gridObject.nextEmptyPosition % cols;

                // Flip column to go right -> left
                let flippedCol = cols - 1 - col;

                // Compute the flat array index
                let index = row * cols + flippedCol;

                // Place the object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );
                gridObject.nextEmptyPosition++

                object.grid_parent = parentObj
                this.addStimulusToScene(object)
                parentObj.add(object)
            });


        }
        if (settings.leftToRightBottom) {
            let rows = gridObject.rows;
            let cols = gridObject.columns;

            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                // Row counting from bottom
                let row = rows - 1 - Math.floor(gridObject.nextEmptyPosition / cols);

                // Column left -> right
                let col = gridObject.nextEmptyPosition % cols;

                // Compute index in flat array
                let index = row * cols + col;

                // Place object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );

                gridObject.nextEmptyPosition++
                this.addStimulusToScene(object)
                parentObj.add(object)
            });

        }

        if (settings.rightToLeftBottom) {
            let rows = gridObject.rows;
            let cols = gridObject.columns;

            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }
                // Current row, counting from bottom
                let row = rows - 1 - Math.floor(gridObject.nextEmptyPosition / cols);

                // Current column, right -> left
                let col = cols - 1 - (gridObject.nextEmptyPosition % cols);

                // Compute flat array index
                let index = row * cols + col;

                // Place object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );

                gridObject.nextEmptyPosition++
                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }

        parentObj.add(gridObject.debugGrid)
        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    preloadDefaultHDRI(pathToHDRI) {
        const hdrEquirectangularMap = new HDRLoader(this.loadingManager);
        hdrEquirectangularMap.load(pathToHDRI, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            texture.name = pathToHDRI;
            this.loadedEnvs.push(texture)
            if (globalSettings.enableHDRI) {
                this.scene.environment = texture;
            }
        });
    }

    preloadHDRI(pathToHDRI) {
        const hdrEquirectangularMap = new RGBELoader(this.loadingManager);

        hdrEquirectangularMap.load(pathToHDRI, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            texture.name = pathToHDRI;
            this.loadedEnvs.push(texture)
        });
    }

    preLoadTextures(texturesToLoad) {
        const textureLoader = new THREE.TextureLoader(this.loadingManager);

        for (let i = 0; i < texturesToLoad.length; i++) {
            textureLoader.load(texturesToLoad[i], (texture) => {
                this.loadedTextures.push(texture)
            });
        }
    }

    preLoadModels(modelsToLoad) {
        /////////////////////////////////////////////////////////////////////////
        // LOAD 3D MODELS ///////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////// 
        const objectLoader = new GLTFLoader(this.loadingManager);
        //const arrayToSaveTo = []


        for (let i = 0; i < modelsToLoad.length; i++) {// Load a glTF resource
            objectLoader.load(
                // resource URL
                modelsToLoad[i],
                // called when the resource is loaded
                (gltf) => {
                    let model = gltf.scene;
                    model.name = modelsToLoad[i]
                    this.loadedModels.push(model)
                },

                function (xhr) {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                // called when loading has errors
                function (error) {
                    console.log('An error happened', error);
                }
            )
        };
        /////////////////////////////////////////////////////////////////////////
    }

    cloneObject(original_object) {
        let objectToReturn;

        if (Array.isArray(original_object)) {
            objectToReturn = [];
            original_object.forEach(function (item) {
                let object = item.clone()
                object.traverse(function (child) {
                    if (child.isMesh) {
                        child.material = child.material.clone()
                    }
                })
                objectToReturn.push(object);
            })
        } else {
            let object = original_object.clone()
            object.traverse(function (child) {
                if (child.isMesh) {
                    child.material = child.material.clone()
                }
            })
            object.name = original_object.name;
            objectToReturn = object;
        }

        return (objectToReturn)
    }

    addStimulusToScene(object) {
        this.scene.add(object);
        this.stimuliInScene.push(object);
    }

    removeStimulusFromScene(object) {
        this.scene.remove(object);
        this.stimuliInScene = this.stimuliInScene.filter(item => item !== object);
    }

    updateGazeControls() {

    }

    trialCleanup() {
        this.stimuliInScene.forEach(object => {
            this.removeStimulusFromScene(object)
        });
        this.interactiveCanvas.style.display = 'none'
    }

    animationLoop(time) {
        this.animationRequestID = requestAnimationFrame((time) => this.animationLoop(time));

        if (this.gazeContingentEnabled) {
            if (this.maskType == 'blur') {
                this.hBlur.uniforms['h'].value = this.gazeContingentControls.blurIntensity / (window.innerWidth / 2);
                this.vBlur.uniforms['v'].value = this.gazeContingentControls.blurIntensity / (window.innerHeight / 2);
                this.blurComposer.render();
                this.finalPass.uniforms.tBlur.value = this.blurRT.texture;
            }
            this.mainComposer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        this.update() // Process loop - user can put their own code here
        if (this.checkStats) { this.stats.update(); }
        this.delta = this.clock.getDelta();
    }

    // ADD POINTER LOCK INTO THE FP CONTROLS
    // ADD AN UPDATE FUNCTION SO THAT PEOPLE CAN ADD THEIR OWN CODE TO THE ANIMATION LOOP 
    update() {

    }


    startAnimationLoop() {
        if (this.animationRequestID != null) {
            this.stopAnimationLoop();
        }
        this.animationLoop();
    }

    stopAnimationLoop() {
        cancelAnimationFrame(this.animationRequestID)
    }

    startTrial() {
        this.clock.start();
        this.startAnimationLoop();
        this.interactiveCanvas.style.display = 'flex'
    }

    enableOrbitControls() {
        this.disableDragToRotateControls()
        this.disableDragControls()
        this.disableGazeContingentControls()
        this.disableFirstPersonControls()

        xAxis.set(1,0,0)
        yAxis.set(0,1,0)
        zAxis.set(0,0,1)

        this.orbitControls.enabled = true;
        this.orbitControlsEnabled = true;
    }

    disableOrbitControls() {
        this.orbitControls.enabled = false;
        this.orbitControlsEnabled = false;
    }

    enableDragControls() {
        this.disableOrbitControls()
        this.disableDragToRotateControls()
        this.disableGazeContingentControls()
        this.disableFirstPersonControls()

        xAxis.set(1,0,0)
        yAxis.set(0,1,0)
        zAxis.set(0,0,1)

        this.dragControlsEnabled = true;
    }

    disableDragControls() {
        this.dragControlsEnabled = false;
    }

    enableDragToRotateControls() {
        this.disableOrbitControls()
        this.disableDragControls()
        this.disableGazeContingentControls()
        this.disableFirstPersonControls()

        xAxis.set(1,0,0)
        yAxis.set(0,1,0)
        zAxis.set(0,0,1)

        this.dragToRotateEnabled = true;
    }

    disableDragToRotateControls() {
        this.dragToRotateEnabled = false;
    }

    enableGazeContingentControls(userSettings = null) {
        // Default settings
        let settings = {
            maskType: 'opaque',
            opacity: 1,
            gazeRadius: 0.1,
            blurIntensity: 0.5,
            colour: '#093f63',
            tintBlur: false,
            tintAmount: 0.5,
            numberOfBlurPasses: 4,
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            if (userSettings.color !== undefined) {
                userSettings.colour = userSettings.color;
                delete userSettings.color;
            }
            this.setValues(settings, userSettings)
        }

        // Apply settings
        switch (settings.maskType.toLowerCase()) {
            case 'blur':
                console.log('blur')
                this.setupBlurMask(settings)
                break
            case 'opaque':
                console.log('opaque')
                this.setupOpaqueMask(settings)
                break
            case 'transparent':
                console.log('transparent')
                this.setupTransparentMask(settings)
                break
        }



        this.disableDragToRotateControls()
        this.disableDragControls()
        this.disableOrbitControls()
        this.disableFirstPersonControls()

        xAxis.set(1,0,0)
        yAxis.set(0,1,0)
        zAxis.set(0,0,1)

        this.gazeContingentControls = settings
        this.gazeContingentEnabled = true;

        console.log(this.gazeContingentControls)
    }

    // ADD COLOUR SETTER FOR MASKS 
    setupBlurMask(controlSettings) {
        this.maskType = 'blur'
        
        this.mainComposer = new EffectComposer(this.renderer);
        this.mainComposer.addPass(new RenderPass(this.scene, this.camera));
        this.blurRT = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, { antialias: true });

        this.blurComposer = new EffectComposer(this.renderer, this.blurRT);
        this.blurComposer.addPass(new RenderPass(this.scene, this.camera));
        this.hBlur = new ShaderPass(HorizontalBlurShader);
        this.vBlur = new ShaderPass(VerticalBlurShader);
        this.hBlur.uniforms['h'].value = 1 / (window.innerWidth / 2);
        this.vBlur.uniforms['v'].value = 1 / (window.innerHeight / 2);

        for(let i = 0; i < controlSettings.numberOfBlurPasses; i++){
            this.blurComposer.addPass(this.hBlur);
            this.blurComposer.addPass(this.vBlur);
        }
        
        this.finalPass = new ShaderPass(BlurMaskShader);
        this.finalPass.renderToScreen = true;

        if (controlSettings.tintBlur == true) {
            this.finalPass.uniforms.maskAlpha.value = controlSettings.tintAmount
            this.setMaskColour(controlSettings.colour)
        }


        // We manually assign the blur texture in the loop
        this.mainComposer.addPass(this.finalPass);

        const gammaPass = new ShaderPass(GammaCorrectionShader);
        this.mainComposer.addPass(gammaPass);

    }
    setupOpaqueMask(controlSettings) {
        console.log(controlSettings)
        this.maskType = 'opaque'
        this.mainComposer = new EffectComposer(this.renderer);
        this.mainComposer.addPass(new RenderPass(this.scene, this.camera));

        this.finalPass = new ShaderPass(SolidColorMaskShader);
        this.setMaskColour(controlSettings.colour)
        this.mainComposer.addPass(this.finalPass);
    }

    setupTransparentMask(controlSettings) {
        this.maskType = 'transparent'
        this.mainComposer = new EffectComposer(this.renderer);
        this.mainComposer.addPass(new RenderPass(this.scene, this.camera));
        this.finalPass = new ShaderPass(TransparentMaskShader);
        this.setMaskColour(controlSettings.colour)
        this.mainComposer.addPass(this.finalPass);
    }

    setMaskColour(colour) {
        this.finalPass.uniforms.maskColor.value.set(colour) // Set the colour
    }

    setGazeRadius(size, softness = null){
        this.finalPass.uniforms.radius.value = size
        
        if(softness != null){
            this.finalPass.uniforms.softness.value = softness
        }
    }

    setBlurIntensity(amount){
        if(this.gazeContingentControls){
            this.gazeContingentControls.blurIntensity = amount
        }
    }

    disableGazeContingentControls() {
        this.gazeContingentEnabled = false;
    }

    turnOnLoadingScreen() {
        this.loadingScreen.style.display = 'flex';
    }

    turnOffLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    placeRandomly3D(userSettings = null) {
        // Default settings
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, randomRotateX: false, randomRotateY: false, randomRotateZ: false, ignoreCollisions: false
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        let objectsToPlace = settings.objectsToPlace
        let parentObj = new THREE.Group();

        let boundingBoxesInScene = []

        let keepChecking = true;
        let startTime = performance.now();
        let totalSuccesses = 0;


        for (const object of objectsToPlace) {
            let successfulPlacement = false;
            let collisions = false;
            let xPos = _.random(-settings.spread, settings.spread, true);
            let yPos = _.random(settings.spread, -settings.spread, true);
            let zPos = _.random(settings.spread, -settings.spread, true);


            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }

            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }


            object.position.set(xPos, yPos, zPos);
            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(object);

            if (boundingBoxesInScene.length === 0) {
                boundingBoxesInScene.push(boundingBox);
                successfulPlacement = true;
            }

            for (let i = 0; i < boundingBoxesInScene.length; i++) {
                let currentTime = performance.now() - startTime;

                if (currentTime > settings.timeout) {
                    break; // breaks the inner loop
                }

                if (settings.ignoreCollisions == false) {
                    let collision = boundingBox.intersectsBox(boundingBoxesInScene[i]);

                    if (collision) {
                        xPos = _.random(-settings.spread, settings.spread, true);
                        yPos = _.random(settings.spread, -settings.spread, true);
                        zPos = _.random(settings.spread, -settings.spread, true);
                        object.position.set(xPos, yPos, zPos);
                        boundingBox.setFromObject(object);
                        i = 0;
                    }


                    if (i === boundingBoxesInScene.length - 1 && !collisions) {
                        successfulPlacement = true;
                    }

                } else {
                    successfulPlacement = true;
                }

            }

            if (performance.now() - startTime > settings.timeout) {
                this.warningMessage("⚠️\nFailed to place all objects without collision. \nConsider decreasing stimuli size, increasing the 'spread' value, or setting 'ignoreCollisions' to true.")
                break; // breaks the main loop
            }

            if (successfulPlacement) {
                boundingBoxesInScene.push(boundingBox);
                object.grid_parent = parentObj
                this.addStimulusToScene(object);
                parentObj.add(object)
            }
        }

        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    placeRandomly2D(userSettings = null) {
        // Default settings
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, axisOrder: 'XY',
            randomRotateX: false, randomRotateY: false, randomRotateZ: false,
            ignoreCollisions: false
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        if (this.stimuliInScene.length > 0) {
            this.stimuliInScene.forEach(object => {
                this.removeStimulusFromScene(object)
            });
        }

        let axisOrder = settings.axisOrder

        let objectsToPlace = settings.objectsToPlace
        let parentObj = new THREE.Group();

        let boundingBoxesInScene = []

        let keepChecking = true;
        let startTime = performance.now();
        let totalSuccesses = 0;


        for (const object of objectsToPlace) {
            let successfulPlacement = false;
            let collisions = false;
            let xPos = _.random(-settings.spread, settings.spread, true);
            let yPos = _.random(settings.spread, -settings.spread, true);
            let zPos = _.random(settings.spread, -settings.spread, true);


            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }

            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }

            switch (axisOrder) {
                case 'YZ':
                    object.position.set(0, yPos, zPos);
                    break
                case 'ZY':
                    object.position.set(0, yPos, zPos);
                    break
                case 'XZ':
                    object.position.set(xPos, 0, zPos);
                    break
                case 'ZX':
                    object.position.set(xPos, 0, zPos);
                    break
                case 'XY':
                    object.position.set(xPos, yPos, 0);
                    break
                case 'YX':
                    object.position.set(xPos, yPos, 0);
                    break
                default:
                    object.position.set(xPos, yPos, 0);
            }

            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(object);

            if (boundingBoxesInScene.length === 0) {
                boundingBoxesInScene.push(boundingBox);
                successfulPlacement = true;
            }

            for (let i = 0; i < boundingBoxesInScene.length; i++) {
                let currentTime = performance.now() - startTime;

                if (currentTime > settings.timeout) {
                    break; // breaks the inner loop
                }

                if (settings.ignoreCollisions == false) {
                    let collision = boundingBox.intersectsBox(boundingBoxesInScene[i]);

                    if (collision) {
                        xPos = _.random(-settings.spread, settings.spread, true);
                        yPos = _.random(settings.spread, -settings.spread, true);
                        zPos = _.random(settings.spread, -settings.spread, true);
                        switch (axisOrder) {
                            case 'YZ':
                                object.position.set(0, yPos, zPos);
                                break
                            case 'ZY':
                                object.position.set(0, yPos, zPos);
                                break
                            case 'XZ':
                                object.position.set(xPos, 0, zPos);
                                break
                            case 'ZX':
                                object.position.set(xPos, 0, zPos);
                                break
                            case 'XY':
                                object.position.set(xPos, yPos, 0);
                                break
                            case 'YX':
                                object.position.set(xPos, yPos, 0);
                                break
                            default:
                                object.position.set(xPos, yPos, 0);
                        }
                        boundingBox.setFromObject(object);
                        i = 0;
                    }

                    if (i === boundingBoxesInScene.length - 1 && !collisions) {
                        successfulPlacement = true;
                    }

                } else {
                    successfulPlacement = true
                }

            }

            if (performance.now() - startTime > settings.timeout) {
                this.warningMessage("⚠️\nFailed to place all objects without collision. \nConsider decreasing stimuli size, increasing the 'spread' value, or setting 'ignoreCollisions' to true.")
                break; // breaks the main loop
            }

            if (successfulPlacement) {
                boundingBoxesInScene.push(boundingBox);
                object.grid_parent = parentObj
                this.addStimulusToScene(object);
                parentObj.add(object)
            }
        }

        this.addStimulusToScene(parentObj);
        return (parentObj);
    }

    setupWarningMessage() {
        // Create overlay container
        warningBox = document.createElement('div');
        warningBox.style.display = 'flex';
        warningBox.style.justifyContent = 'center';
        warningBox.style.alignItems = 'center';
        warningBox.style.width = '100vw';
        warningBox.style.height = '100vh';
        warningBox.style.position = 'fixed';
        warningBox.style.top = '0';
        warningBox.style.left = '0';
        warningBox.style.backgroundColor = 'rgba(0, 0, 0, 0.14)';
        warningBox.style.zIndex = '2000';
        warningBox.style.display = 'none';
        warningBox.style.backdropFilter = 'blur(5px)';

        // Create the actual warning box
        warningBoxText = document.createElement('div');
        warningBoxText.style.backgroundColor = '#fff3cd';
        warningBoxText.style.color = '#856404';
        warningBoxText.style.border = '1px solid #ffeeba';
        warningBoxText.style.padding = '10px 20px';
        warningBoxText.style.borderRadius = '6px';
        warningBoxText.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        warningBoxText.style.display = 'flex';
        warningBoxText.style.alignItems = 'center';
        warningBoxText.style.gap = '10px';
        warningBoxText.style.fontSize = '16px';
        warningBoxText.style.flexDirection = 'column';

        // Create text element (this is what you’ll update later)
        warningMessageText = document.createElement('span');
        warningMessageText.style.whiteSpace = 'pre-line';
        warningMessageText.style.textAlign = 'center';
        //warningMessageText.textContent = '⚠️ Warning: Something went wrong!';

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.backgroundColor = '#856404';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.padding = '6px 12px';
        closeBtn.style.fontSize = '16px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.transition = 'background-color 0.2s ease, transform 0.1s ease';

        // Optional hover/focus effects
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#b5880d';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = '#856404';
        });
        closeBtn.addEventListener('mousedown', () => {
            closeBtn.style.transform = 'scale(0.95)';
        });
        closeBtn.addEventListener('mouseup', () => {
            closeBtn.style.transform = 'scale(1)';
        });
        closeBtn.addEventListener('focus', () => {
            closeBtn.style.outline = '2px solid #b5880d';
        });
        closeBtn.addEventListener('blur', () => {
            closeBtn.style.outline = 'none';
        });

        // Close button functionality
        closeBtn.addEventListener('click', () => {
            warningBox.style.display = 'none';
        });

        // Put everything together
        warningBoxText.appendChild(warningMessageText);
        warningBoxText.appendChild(closeBtn);
        warningBox.appendChild(warningBoxText);
        document.body.appendChild(warningBox);
    }

    warningMessage(textToDisplay) {
        warningMessageText.textContent = textToDisplay;
        warningBox.style.display = 'flex';
    }

    setGazeContingentSize(size) {
        this.gazeContingentControls.scale.set(size, size, size)
    }

    setGazeContingentMaskType(type) {
        if (!materialTypes.includes(type)) {
            console.warn(
                `'${type}' is not a mask type. Please choose from the following types: ${materialTypes.toString()}`
            );
            return
        } else {
            switch (type.toLowerCase()) {
                case 'blur':
                    console.log('blur')
                    break
                case 'opaque':
                    console.log('opaque')
                    break
                case 'transparent':
                    console.log('transparent')
                    break
            }
        }
    }

    setGazeContingentMaskColour(hexColour = null) {
        if (hexColour == null) {
            console.warn('Please provide a hex string')
            return
        } else {
            const colour = new THREE.Color().setHex(hexColour);
            if (colour.isColor) {
                this.gazeContingentPlane.material.color = colour
            }
        }
    }

}

// If you want it to be the ONLY thing exported:
export default InteractiveSearchToolbox;