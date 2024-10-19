import { Component } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-escanear-codigo-qr',
  templateUrl: './escanear-codigo-qr.page.html',
  styleUrls: ['./escanear-codigo-qr.page.scss'],
})
export class EscanearCodigoQRPage {

  image: any;

  constructor() {}

  async openCamera() {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,  // Aquí obtenemos la URI de la imagen
      source: CameraSource.Camera        // Esto abre directamente la cámara
    });

    this.image = image.webPath;          // Asignamos la ruta de la imagen capturada
  }
}
