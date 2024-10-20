import { Component, OnInit } from '@angular/core';
import { AnimationController } from '@ionic/angular';
import { slideInAnimationDerAIzq } from 'src/app/animations/slide-in-animation/slide-in-animation.page';

@Component({
  selector: 'app-tab-alumnos',
  templateUrl: './tab-alumnos.page.html',
  styleUrls: ['./tab-alumnos.page.scss'],
})
export class TabAlumnosPage implements OnInit {

  constructor(private animationCtrl: AnimationController) { }

  ngOnInit() {
  }

  async ionViewDidEnter(){ //NO CAMBIAR NOMBRE ionViewDidEnter es un hook, no un método. Si lo cambias deja de funcionar la animación
    const animation = slideInAnimationDerAIzq(this.animationCtrl);
    await animation.play();
  }
}
