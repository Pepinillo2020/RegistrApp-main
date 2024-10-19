import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../services/class.service';
import { Class } from '../../models/class.model';

@Component({
  selector: 'app-clases',
  templateUrl: './clases.page.html',
  styleUrls: ['./clases.page.scss'],
})
export class ClasesPage implements OnInit {
  classes: Class[] = [];

  constructor(private classService: ClassService) {}

  ngOnInit() {
    this.loadClasses();
  }

  loadClasses() {
    this.classService.getClasses().subscribe(data => {
      this.classes = data;
    });
  }

  deleteClass(id: string) {
    this.classService.deleteClass(id).subscribe(() => {
      this.loadClasses();
    });
  }
}
