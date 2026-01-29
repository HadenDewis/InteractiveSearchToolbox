// Manually placing numerous stimuli is hard work, so let's use one of our helper functions
                // First, make an array containing all the stimuli we want in the scene - we simply clone the master object 8 times
                // You could make your own helper function to do this if you wish.

                let objectsForScene = []

                for (let i = 0; i < 16; i++) {
                    let newObj = interactiveSearchToolbox.cloneObject(object) // Clone the object

                    // Change the colour of the objects randomly
                    newObj.traverse(function (child) {
                        if (child.isMesh) {
                            child.material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xFFFFFF })
                        }
                    })

                    newObj.scale.set(0.1, 0.1, 0.1) // Make the object smaller

                    objectsForScene.push(newObj); // Add it to our stimuli array
                }



                // Place that array into the helper function - this will randomly place each object into the scene 

                /*interactiveSearchToolbox.placeRandomly3D({
                    objectsToPlace:objectsForScene,
                    randomRotation: true,
                    //randomRotateZ:true,
                    spread: 5
                });*/

                /*
                interactiveSearchToolbox.placeRandomly2D({
                    objectsToPlace:objectsForScene,
                    randomRotation: false,
                    //randomRotateZ:true,
                    axisOrder:'XY',
                    spread: 8
                });*/

                /*interactiveSearchToolbox.placeOnGrid({
                    stimuli:objectsForScene,
                    columns:6, 
                    rows:4,
                    jitter:0.1,
                    distanceBetween:1,
                    showDebugGrid:true,
                    randomPlacement:true,
                    randomRotation:true,
                })*/

                //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                // MULTIPLE PATCHES EXAMPLE //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

                interactiveSearchToolbox.trialCleanup();


                // What if we want multiple grids within one scene?
                // We can calculate numerous separate grids and supply each of them to our object placing functions to place objects within that specific grid

                let lowInfoPatch = []
                let highInfoPatch = []

                for (let i = 0; i < (16 + 8); i++) {
                    let newObj = interactiveSearchToolbox.cloneObject(object)
                    newObj.traverse(function (child) {
                        if (child.isMesh) {
                            child.material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xFFFFFF })
                        }
                    })
                    newObj.scale.set(0.1, 0.1, 0.1)
                    if (i < 16) {
                        highInfoPatch.push(newObj);
                    } else {
                        lowInfoPatch.push(newObj);
                    }

                }

                let gridNumber1 = interactiveSearchToolbox.calculateGridPositions({
                    stimuli: highInfoPatch,
                    //showDebugGrid:true,
                    columns: 4,
                    rows: 4,
                    jitter: 0,
                    distanceBetween: 1
                });

                let objectsInGrid1 = interactiveSearchToolbox.placeOnManualGrid({
                    stimuli: highInfoPatch,
                    gridObject: gridNumber1,
                    randomPlacement: true
                })

                let gridNumber2 = interactiveSearchToolbox.calculateGridPositions({
                    stimuli: lowInfoPatch,
                    //showDebugGrid:true,
                    columns: 4,
                    rows: 4,
                    jitter: 0,
                    distanceBetween: 1
                });

                let objectsInGrid2 = interactiveSearchToolbox.placeOnManualGrid({
                    stimuli: lowInfoPatch,
                    gridObject: gridNumber2,
                    randomPlacement: true
                })

                let gridNumber3 = interactiveSearchToolbox.calculateGridPositions({
                    stimuli: [objectsInGrid1, objectsInGrid2],
                    //showDebugGrid:true,
                    columns: 2,
                    rows: 2,
                    jitter: 0,
                    distanceBetween: 6
                });

                interactiveSearchToolbox.placeOnManualGrid({
                    stimuli: [objectsInGrid1, objectsInGrid2],
                    gridObject: gridNumber3,
                    randomPlacement: true,
                    randomRotation: false
                })

                interactiveSearchToolbox.trialCleanup();
                //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

                // What if we don't want to use a grid but still want multiple "patches"?
                // All of our placement helper functions will return a parent object that contains your objects.
                let randomPlacementPatch = interactiveSearchToolbox.placeRandomly3D({
                    objectsToPlace: objectsForScene,
                    randomRotation: true,
                    //randomRotateZ:true,
                    spread: 2.5
                })

                interactiveSearchToolbox.trialCleanup();

                randomPlacementPatch = interactiveSearchToolbox.placeRandomly2D({
                    objectsToPlace: objectsForScene,
                    randomRotation: true,
                    //randomRotateZ:true,
                    spread: 2.5
                })

                interactiveSearchToolbox.placeOnGrid({
                    stimuli: randomPlacementPatch,
                    columns: 2,
                    rows: 2,
                    jitter: 0.1,
                    distanceBetween: 1,
                    //showDebugGrid:true,
                    randomPlacement: true,
                    randomRotation: false,
                })




                interactiveSearchToolbox.camera.position.z = 150;

                // Enable the type of controls you want to use
                //interactiveSearchToolbox.enableOrbitControls();