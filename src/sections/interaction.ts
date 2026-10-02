/**
 * Raycasting interaction for clickable 3D link planes.
 */
import * as THREE from 'three';

export function setupInteraction(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  getInteractiveMeshes: () => THREE.Mesh[],
): void {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  canvas.addEventListener('click', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = getInteractiveMeshes();
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      const { href, download } = hits[0].object.userData;
      if (download) {
        const a = document.createElement('a');
        a.href = download;
        a.download = download.split('/').pop() ?? 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (href) {
        if (href.startsWith('mailto:')) {
          window.location.href = href;
        } else {
          window.open(href, '_blank', 'noopener');
        }
      }
    }
  });

  // Pointer cursor on hover
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = getInteractiveMeshes();
    const hits = raycaster.intersectObjects(meshes);

    canvas.style.cursor = hits.length > 0 ? 'pointer' : '';
  });
}
