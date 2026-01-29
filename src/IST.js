import 'jspsych/css/jspsych.css'
import {initJsPsych} from "jspsych"
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


// BUILD THE WHOLE MODULE HERE NOW 
let globalSettings
let lastTime = 0;

class InteractiveSearchToolbox {
    constructor(userSettings = null) {
        globalSettings = {
            enableAmbientLighting: true,
            responsiveDisplaySize: true,
            enableHDRI: false,
        };

        if (userSettings != null) {
            this.setValues(globalSettings, userSettings)
        }

        this.loadingManager = new THREE.LoadingManager();
        this.loadedModels = [];
        this.loadedTextures = [];
        this.loadedEnvs = [];
        this.loadingScreen;
        this.loadingText;
        this.backgroundColor = '#c7c7c7';
        this.warningBox;
        this.warningBoxText;

        this.scene;
        this.camera;
        this.renderer;
        this.enableLighting = true//this.enableLighting
        this.interactiveCanvas;
        this.stimuliInScene = []
        this.selectedObject = null
        this.helperControls = true

        // Interaction Controls variables
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.set( 0 );
        this.pointer = new THREE.Vector2();
        this.pointerDelta = new THREE.Vector2();
        this.previousPointer = new THREE.Vector2();
        this.delta = 0
        this.clock = new THREE.Clock();
        this.xAxis = new THREE.Vector3(1,0,0)
        this.yAxis = new THREE.Vector3(0,1,0)
        this.worldPointer = new THREE.Vector3(0, 0, 0.5);
        this.worldPosition = new THREE.Vector3()
        this.zOffset = 5
        this.zTarget = new THREE.Vector3()
        this.pointerDown = false;
        this.pointerUp = true;
        this.currentRaycastObject = null;
        this.checkStats = false
        //this.debugCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),new THREE.MeshBasicMaterial({ color: 0x00ff00 }));


        //this.orbitControls;
        this.dragToRotateEnabled = false
        this.orbitControlsEnabled = false
        this.dragControlsEnabled = false
        
        //this.dragControls;
        this.gazeContingentControls;
        this.animationRequestID = null;

        this.objectsInScene = []

        this.stats = new Stats();
        document.body.appendChild( this.stats.dom );
        this.stats.dom.style.display = 'none'

        document.body.style.margin = "0"; 

        this.setupLoadingScreen();
        this.setupWarningMessage();
        this.setupToolbox();
        this.turnOnLoadingScreen();
    }

    setValues(defaultSettings, values) {

        if (values === undefined) return;

        for (const key in values) {

            const newValue = values[key];

            if (newValue === undefined) {
                console.warn(`Parameter '${key}' has value of undefined.`);
                continue;
            }

            const currentValue = defaultSettings[key];

            //console.log(defaultSettings)

            if (currentValue === undefined) {
                console.warn(`${key}' is not a recognisable setting parameter.`);
                continue;
            }

            if (newValue != null) {
                defaultSettings[key] = newValue;
            }
        }

    }

    setupToolbox() {
        // Check for dependencies first
        if (typeof jsPsych !== 'undefined') {
        } else {
            this.warningMessage('⚠️\njsPsych is not loaded.\nEnsure you have included the correct CDN in your index file!')
        }


        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.backgroundColor);
        if (globalSettings.enableAmbientLighting == true) {
            const light = new THREE.AmbientLight(0x404040, 35); // soft white light
            this.scene.add(light);
        }

        this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.scene.add(this.camera)
        this.camera.layers.enableAll();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.disableOrbitControls()
        this.disableDragControls()
        this.disableDragToRotateControls()
        
        this.interactiveCanvas = this.renderer.domElement;

        if (globalSettings.responsiveDisplaySize == true) {
            window.addEventListener('resize', () => {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            })
        }

        //this.scene.add(this.debugCube);
        
        window.addEventListener('pointerdown', (event) => {
        if (event.button == 0) {
            this.raycastScene()
            this.selectedObject = this.currentRaycastObject;
            this.pointerDown = true; 
            this.pointerUp = false;
        } else {
            return;
        }
        });

        window.addEventListener('pointerup', (event) => {
            this.currentRaycastObject = null;
            this.pointerUp = true;
            this.pointerDown = false;
        });

        window.addEventListener('pointermove', (event) => {
            // calculate pointer position in normalized device coordinates
            // (-1 to +1) for both components
            this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;


            this.pointerDelta.x = this.pointer.x - this.previousPointer.x;
            this.pointerDelta.y = (this.pointer.y) - this.previousPointer.y;

            this.raycastScene()
            this.handleControls(event)
            
            this.previousPointer.x = this.pointer.x;
            this.previousPointer.y = this.pointer.y;
        });

        document.addEventListener("mouseleave", (event) => {
            if (event.clientY <= 0 || event.clientX <= 0 || (event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) {
                this.currentRaycastObject = null;
                this.selectedObject = null;
            }
        });

        this.preloadDefaultHDRI('https://cdn.jsdelivr.net/gh/HadenDewis/InteractiveSearchToolbox@latest/toolbox_assets/smallStudio.hdr')

    }

    init() {
        window.THREE = THREE
        window.jsPsych = initJsPsych();
        window.canvasKeyboardResponse = canvasKeyboardResponse
        window.canvasButtonResponse = canvasButtonResponse
        window.htmlKeyboardResponse = htmlKeyboardResponse
        window.htmlButtonResponse = htmlButtonResponse
        window.instructions = instructions
        window._ = _

        this.interactiveCanvas.style.display = 'none';
        this.turnOffLoadingScreen();
    }

    showDebugStats(){
        this.checkStats = true
        this.stats.dom.style.display = 'flex'
    }

    hideDebugStats(){
        this.checkStats = false
        this.stats.dom.style.display = 'none'
    }

    disableAllControls(){
        this.helperControls = false
    }

    enableAllControls(){
        this.helperControls = true
    }

    handleControls(event){
        // If enabled
        if(this.helperControls){
            switch(true) {
                case this.dragControlsEnabled:
                    this.dragControls(event,this.selectedObject)
                    break;
                case this.orbitControlsEnabled:
                    this.orbitControls.update()
                    break;
                case this.dragToRotateEnabled:
                    this.dragToRotate(event,this.selectedObject);
                    break
            }
        }   
    }

    raycastScene(){
        this.raycaster.setFromCamera( this.pointer, this.camera );

        // calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObjects( this.stimuliInScene );

            
        if(intersects.length>0){
            this.currentRaycastObject = intersects[0].object

            let keepChecking = true;
            
            while(keepChecking){
                let parent = this.currentRaycastObject.parent
                let grid_parent = this.currentRaycastObject.grid_parent
                
                if(parent == this.scene || parent == grid_parent){
                    keepChecking = false
                    break
                }else{
                    this.currentRaycastObject = parent;
                }
            }
        }else{
            this.currentRaycastObject = null
        }        

    }

    // Right now this is just using 0 for distance plane 
    dragControls(event,obj = null){
        if(obj != null){
            if(this.pointerDown){
                let pos = this.mouseToWorld(obj.position.z)
                obj.parent.worldToLocal(pos);
                obj.position.copy(pos);
            }
        }        
    }

    dragToRotate(event,obj = null){
        if(obj != null){
            if(this.pointerDown){
                //Allow the cube to rotate with mouse movements
                let xRotationAmount = (this.pointerDelta.x * 200) * this.delta;
                let yRotationAmount = ((this.pointerDelta.y * 200) * this.delta) * -1;

                obj.rotateOnWorldAxis(this.yAxis, xRotationAmount);
                obj.rotateOnWorldAxis(this.xAxis, yRotationAmount);
            }
        }

    }

    mouseToWorld(planeCoord = null) {
        if(planeCoord != null){
            this.worldPointer.set(this.pointer.x, this.pointer.y, 0)
        }else{
            this.worldPointer.set(this.pointer.x, this.pointer.y, planeCoord)
        }
        
        this.worldPointer.unproject(this.camera);
        this.worldPointer.sub(this.camera.position).normalize();

        let distance = this.camera.position.distanceTo(this.zTarget)
        this.worldPosition.copy(this.camera.position).add(this.worldPointer.multiplyScalar(distance));
        return (this.worldPosition);
    }

    findLoadedItem(name) {
        return (this.loadedModels.find(obj => obj.name === name));
    }

    findLoadedTexture(name) {
        return (this.loadedTextures.find(obj => obj.name === name));
    }


    setupLoadingScreen() {
        this.loadingScreen = document.createElement('div')
        this.loadingScreen.setAttribute('id', 'loadingScreen');

        this.loadingText = document.createElement('div')
        this.loadingText.setAttribute('id', 'loadingText');

        this.loadingScreen.style.display = 'flex';
        this.loadingScreen.style.position = 'absolute';
        this.loadingScreen.style.top = '0%';
        this.loadingScreen.style.width = '100vw';
        this.loadingScreen.style.zIndex = '1000';
        this.loadingScreen.style.height = '100vh';
        this.loadingScreen.style.backgroundColor = this.backgroundColor;
        this.loadingScreen.style.alignItems = 'center';
        this.loadingScreen.style.justifyContent = 'center';

        this.loadingText.innerText = 'Loading...'

        this.loadingScreen.appendChild(this.loadingText);
        document.body.appendChild(this.loadingScreen);
    }

    calculateGridPositionsInternal(userSettings = null) {

       let settings = {
            stimuli: [],
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 2,
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            showDebugGrid: false,
            randomPlacement: false,
            leftToRightTop: false,
            leftToRightBottom: false,
            rightToLeftTop: false,
            rightToLeftBottom: false
        }

        this.setValues(settings, userSettings)

        if (settings.randomPlacement == true) {
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }

        if (settings.leftToRightTop == true) {
            settings.randomPlacement == false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.leftToRightBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftTop == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
        }

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
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;
        let trueArea = settings.itemWidth * settings.itemHeight
        let debugGrid = new THREE.Group();
        debugGrid.layers.set( 1 );
        debugGrid.name = 'DEBUG_GRID_IGNORE';

        for (let row = 0; row < settings.rows; row++) {
            for (let col = 0; col < settings.columns; col++) {
                // Calculate the center position of each box
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                let jitter = (settings.jitter / trueArea) * _.sample([-1, 1])

                positions.push(new THREE.Vector3(x + jitter, y + jitter, 0))
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.position.set(x + jitter, y + jitter, 0)
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set( 1 );
                debugGrid.add(plane)

            }
        }

        this.scene.add(debugGrid)


        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows:settings.rows, columns:settings.columns }
    }

    calculateGridPositions(userSettings = null) {

       let settings = {
            stimuli: [],
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 2,
            showDebugGrid: false
        }

        this.setValues(settings, userSettings)

        if (settings.randomPlacement == true) {
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }

        if (settings.leftToRightTop == true) {
            settings.randomPlacement == false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.leftToRightBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftTop == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
        }

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
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;
        let trueArea = settings.itemWidth * settings.itemHeight
        let debugGrid = new THREE.Group();
        debugGrid.name = 'DEBUG_GRID_IGNORE';
        debugGrid.layers.set(1)

        for (let row = 0; row < settings.rows; row++) {
            for (let col = 0; col < settings.columns; col++) {
                // Calculate the center position of each box
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                let jitter = (settings.jitter / trueArea) * _.sample([-1, 1])

                positions.push(new THREE.Vector3(x + jitter, y + jitter, 0))
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.position.set(x + jitter, y + jitter, 0)
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set(1)
                debugGrid.add(plane)
            }
        }

        this.scene.add(debugGrid)


        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows:settings.rows, columns:settings.columns }
    }

    placeOnGrid(userSettings = null) {
        let settings = {
            stimuli: [],
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 2,
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            showDebugGrid: false,
            randomPlacement: false,
            leftToRightTop: false,
            leftToRightBottom: false,
            rightToLeftTop: false,
            rightToLeftBottom: false
        }

        this.setValues(settings, userSettings)

        if (settings.randomPlacement == true) {
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }

        if (settings.leftToRightTop == true) {
            settings.randomPlacement == false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.leftToRightBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftTop == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
        }

        let parentObj = new THREE.Group();
        let objectsToPlace, gridObject;

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        objectsToPlace = settings.stimuli

        gridObject = this.calculateGridPositionsInternal(settings)
        
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

                object.grid_parent = parentObj;

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }
        if (settings.leftToRightTop) { 
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

                object.position.set(gridObject.positions[gridObject.nextEmptyPosition].x,gridObject.positions[gridObject.nextEmptyPosition].y,gridObject.positions[gridObject.nextEmptyPosition].z)
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
                this.addStimulusToScene(object)

                object.grid_parent = parentObj
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
                object.grid_parent = parentObj

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
        return(parentObj)
    }

    placeOnManualGrid(userSettings = null){
        let settings = {
            stimuli: [],
            gridObject: {},
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            randomPlacement: false,
            leftToRightTop: false,
            leftToRightBottom: false,
            rightToLeftTop: false,
            rightToLeftBottom: false
        }

        this.setValues(settings, userSettings)

        if (settings.randomPlacement == true) {
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }

        if (settings.leftToRightTop == true) {
            settings.randomPlacement == false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.leftToRightBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.rightToLeftTop = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftTop == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftBottom = false
        }
        if (settings.rightToLeftBottom == true) {
            settings.randomPlacement == false
            settings.leftToRightTop = false
            settings.leftToRightBottom = false
            settings.rightToLeftTop = false
        }

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

                object.position.set(gridObject.positions[gridObject.nextEmptyPosition].x,gridObject.positions[gridObject.nextEmptyPosition].y,gridObject.positions[gridObject.nextEmptyPosition].z)
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
        return(parentObj)
    }
    preloadDefaultHDRI(pathToHDRI) {
        
        const hdrEquirectangularMap = new HDRLoader(this.loadingManager);
        //hdrEquirectangularMap.setCrossOrigin('anonymous');
        hdrEquirectangularMap.load(pathToHDRI, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            texture.name = pathToHDRI;
            this.loadedEnvs.push(texture)
            if(globalSettings.enableHDRI){
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

        for(let i = 0; i < texturesToLoad.length; i++){
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

    trialCleanup() {
        this.stimuliInScene.forEach(object => {
            this.removeStimulusFromScene(object)
        });
        this.interactiveCanvas.style.display = 'none'
    }

    animationLoop(time) {
        this.animationRequestID = requestAnimationFrame((time) => this.animationLoop(time));
        this.renderer.render(this.scene, this.camera);
        
        if(this.checkStats){this.stats.update();}
        this.delta = this.clock.getDelta();
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
        this.dragControlsEnabled = true;
    }

    disableDragControls() {
        this.dragControlsEnabled = false;
    }

    enableDragToRotateControls() {
        this.disableOrbitControls()
        this.disableDragControls()
        this.dragToRotateEnabled = true;
    }

    disableDragToRotateControls() {
        this.dragToRotateEnabled = false;
    }

    turnOnLoadingScreen() {
        this.loadingScreen.style.display = 'flex';
    }

    turnOffLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    placeRandomly3D(userSettings = null) {
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, randomRotateX: false, randomRotateY: false, randomRotateZ: false, ignoreCollisions: false
        };

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

                if(settings.ignoreCollisions == false){
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

                }else{
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
        return(parentObj)
    }

    placeRandomly2D(userSettings = null) {
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, axisOrder: 'XY',
            randomRotateX: false, randomRotateY: false, randomRotateZ: false,
            ignoreCollisions: false
        };

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

                if(settings.ignoreCollisions == false){
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

                }else{
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
        return(parentObj);
    }

    setupWarningMessage() {
        // Create overlay container
        this.warningBox = document.createElement('div');
        this.warningBox.style.display = 'flex';
        this.warningBox.style.justifyContent = 'center';
        this.warningBox.style.alignItems = 'center';
        this.warningBox.style.width = '100vw';
        this.warningBox.style.height = '100vh';
        this.warningBox.style.position = 'fixed';
        this.warningBox.style.top = '0';
        this.warningBox.style.left = '0';
        this.warningBox.style.backgroundColor = 'rgba(0, 0, 0, 0.14)';
        this.warningBox.style.zIndex = '2000';
        this.warningBox.style.display = 'none';
        this.warningBox.style.backdropFilter = 'blur(5px)';

        // Create the actual warning box
        this.warningBoxText = document.createElement('div');
        this.warningBoxText.style.backgroundColor = '#fff3cd';
        this.warningBoxText.style.color = '#856404';
        this.warningBoxText.style.border = '1px solid #ffeeba';
        this.warningBoxText.style.padding = '10px 20px';
        this.warningBoxText.style.borderRadius = '6px';
        this.warningBoxText.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        this.warningBoxText.style.display = 'flex';
        this.warningBoxText.style.alignItems = 'center';
        this.warningBoxText.style.gap = '10px';
        this.warningBoxText.style.fontSize = '16px';
        this.warningBoxText.style.flexDirection = 'column';

        // Create text element (this is what you’ll update later)
        this.warningMessageText = document.createElement('span');
        this.warningMessageText.style.whiteSpace = 'pre-line';
        this.warningMessageText.style.textAlign = 'center';
        //this.warningMessageText.textContent = '⚠️ Warning: Something went wrong!';

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
            this.warningBox.style.display = 'none';
        });

        // Put everything together
        this.warningBoxText.appendChild(this.warningMessageText);
        this.warningBoxText.appendChild(closeBtn);
        this.warningBox.appendChild(this.warningBoxText);
        document.body.appendChild(this.warningBox);
    }

    warningMessage(textToDisplay) {
        this.warningMessageText.textContent = textToDisplay;
        this.warningBox.style.display = 'flex';
    }


}

// If you want it to be the ONLY thing exported:
export default InteractiveSearchToolbox;