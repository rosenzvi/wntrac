/**
 * Copyright 2020 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import {Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef} from '@angular/core';
import {FormBuilder, Validators} from '@angular/forms';
import { Observable } from 'rxjs';
import {
  debounceTime,
  tap,
  switchMap,
  finalize, startWith, map,
} from 'rxjs/operators';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ApiService } from '../../api.service';
import { UncategorizedDialogComponent } from './uncategorized-dialog/uncategorized-dialog.component';
import { EvidenceDialogComponent } from './evidence-dialog/evidence-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import moment from 'moment';
import { IDropdownSettings } from 'ng-multiselect-dropdown';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import {MatChipInputEvent} from '@angular/material/chips';
import {COMMA, ENTER} from '@angular/cdk/keycodes';


@Component({
  selector: 'uncategorized',
  templateUrl: './uncategorized.component.html',
  styleUrls: ['./uncategorized.component.scss'],
})
export class UncategorizedComponent implements OnInit {
  constructor(private fb: FormBuilder, private apiService: ApiService, public dialog: MatDialog, private snackBar: MatSnackBar) {
    this.filteredTags = this.uncategorizedForm.controls.value.valueChanges.pipe(
        startWith(null),
        map((tag: string | null) => tag ? this._filter(tag) : this.value.categories.slice()));
  }
  @Input() viewerMode: boolean;

  @Output() removeItem = new EventEmitter<number>();
  @Input() evidence: any;

  types: Array<string>; // types dropdown
  unmappedTypes: any; // types with value field type and values
  value: any; // for setting up the value field
  filteredCountries: Observable<string[]>; // used for the country autocomplete
  fine_grained_location_selector: any;  // used to hide fine grained location
  approximate_date_selector: any;  // used to signal that the date is approximate
  sentToSave: boolean;
  sentToDiscard: boolean;
  snackBarVerticalPosition: any;
  snackBarHorizontalPosition: any;
  selectedCountry: any = '';

  // Value country multiselect dropdown
  allCountries = [];
  multiSelectedCountries = [];
  multiselectDropdownSettings: IDropdownSettings = {
      singleSelection: false,
      unSelectAllText: 'Unselect All',
      itemsShowLimit: 15,
      allowSearchFilter: true,
      enableCheckAll: false,
      idField: 'code',
      textField: 'country'
      // selectAllText: 'All regions',
    };
  // Tags setup
  filteredTags: Observable<string[]>;
  selectedTags: string[] = [];
  separatorKeysCodes: number[] = [ENTER, COMMA];

  // loading
  countriesLoading = false;
  saveLoading = false;
  discardLoading = false;
  showEventLoading = false;

  // snackbar settings for this page
  snackBarTimeOut = 5000;


  uncategorizedForm = this.fb.group({
    country: ['', Validators.required],
    date: ['', [Validators.required]],
    type: ['', Validators.required],
    value: ['', Validators.required],
    restriction: ['', Validators.required],
    citation_url: [''],
    anno_provided_url: [''],
    fine_grained_location_selector: ['', Validators.required],
    fine_grained_location: [''],
    approximate_date_selector: ['', Validators.required],
    event_id: ['']
  });

  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>;

  getEventTypes(forceUpdate = false) {
    this.apiService.getEventTypes(forceUpdate).subscribe((types: any) => {
      if (types) {
        this.types = this.apiService.mapEventTypes(types);
        const map = new Map();
        types.forEach(entry => {
          if (map.get(entry.type) === undefined) {
            let newCategories;
            if (entry.value != 'None') {
              newCategories = [{value: entry.value, official_value: entry.official_value}];
            }
            map.set(entry.type,
              {
                data_type: entry.data_type,
                official_type: entry.official_type,
                integerstring: entry.integerstring,
                eventtype_id: entry.eventtype_id,
                categories: newCategories
              });
          } else {
            const mapEntry = map.get(entry.type);
            if (mapEntry.data_type != entry.data_type
              || mapEntry.official_type != entry.official_type
              || mapEntry.integerstring != entry.integerstring
              || mapEntry.eventtype_id != entry.eventtype_id) {
              console.error('Mismatch in preexisting map value!');
            } else {
              const newCategory = {value: entry.value, official_value: entry.official_value};
              mapEntry.categories.push(newCategory);
              if (mapEntry.data_type === 'Tags') {
                mapEntry.categories.sort((a, b) => (a.value.toLowerCase() > b.value.toLowerCase()) ? 1 : -1);
              }
              map.set(entry.type, mapEntry);
            }
          }
        });
        this.unmappedTypes = map;

        // value field varies based on selection in type field, need to set correct field/values
        this.value = this.unmappedTypes.get(this.evidence.type);
      }
      this.fine_grained_location_selector = '';
      this.approximate_date_selector = '';
      this.sentToSave = false;
      this.sentToDiscard = false;

    }), ((error: Error) => {

    });
  }

  ngOnInit() {

    this.snackBarVerticalPosition = 'top';
    this.snackBarHorizontalPosition  = 'end';

    this.apiService.getCountryCodes('', true).then(result => {
      this.allCountries = result.sort((a, b) => (a.country.toLowerCase() > b.country.toLowerCase()) ? 1 : -1);
      this.allCountries.unshift({code: 'na', country: 'N/A'});
      this.allCountries.unshift({code: 'other', country: 'Other'});
      this.allCountries.unshift({code: 'all', country: 'All regions'});
    });

    // setup the type dropdown and value field
    this.getEventTypes();
    this.uncategorizedForm.patchValue({
      country: this.evidence.country,
      type: this.evidence.type,
      date: this.fixDate(this.evidence.date),
      value: this.evidence.value,
      restriction: (this.evidence.restriction == '1.0' ? '1' : this.evidence.restriction), // handling 1.0s,
      citation_url: this.evidence.citation_url,
      anno_provided_url: this.evidence.anno_provided_url,
      fine_grained_location: this.evidence.fine_grained_location,
      approximate_date_selector: this.evidence.approx_date_bool,
      evid_id: this.evidence.evid_id,
      event_id: this.evidence.even_id
    });

    let oldType = this.evidence.type;
    this.uncategorizedForm.get('type').valueChanges.subscribe(val => {
      this.value = this.unmappedTypes.get(val);
      // this.uncategorizedForm.patchValue({'value':''});
      if (this.unmappedTypes.get(oldType) && this.unmappedTypes.get(oldType).data_type != this.value.data_type) {
        this.uncategorizedForm.controls.value.clearValidators();
      }
      this.uncategorizedForm.controls.value.setValue('');
      this.uncategorizedForm.controls.value.setErrors({required: true});

      this.selectedTags = [];
      this.multiSelectedCountries = [];
      oldType = val;
    });

    // autocomplete
    this.filteredCountries = this.uncategorizedForm.controls.country.valueChanges
      .pipe(
        debounceTime(500),
        tap(() => (this.countriesLoading = true)),
        switchMap((value) => this.apiService.getCountryCodes(value.toLowerCase(), true))
      )
      .pipe(finalize(() => (this.countriesLoading = false)));
  }

    countryClick(event: any) {
    this.selectedCountry = event.option.value;
  }

  checkCountry() {
    const country = this.uncategorizedForm.controls.country;
    if (!country || this.selectedCountry !== this.uncategorizedForm.controls.country.value) {
      this.uncategorizedForm.controls.country.setValue('');
      this.selectedCountry = '';
    }
  }

  fixDate(input) {
    const date = moment(input).format();
    return date;
  }

  // format form values into formats the api expects
  private createSubmitObject(): object {
    const formValues = this.uncategorizedForm.value;

    if (moment(formValues.date).isValid()) {
      const date = moment(formValues.date).format('YYYY-MM-DD');
      formValues.date = date; // api expects "YYYY-MM-DD"
    } else {
      console.log('DATE ERROR!');
    }

    // This is kind of a hack, Angular doesn't allow '' to pop up in the values
    if (formValues && formValues.value == '-') {
      formValues.value = '';
    }
    if (formValues && formValues.value == ' ') {
      formValues.value = '';
    }

    if (this.value.data_type === 'Category') {
      const matches = this.value.categories.filter(category => category.value.toLowerCase() === formValues.value.toLowerCase());
      if (matches.length == 0) {
        formValues.newValue = true;
        formValues.newType = false;
        if (formValues.value != 'other') {
          formValues.other_value = formValues.value + '';
          formValues.value = 'other';
        }


      } else if (matches.length == 1) {
        formValues.newValue = false;
        formValues.newType = false;

        if (matches[0].official_value == 'True') {
          console.log('Preexisting official value');
        } else {
          console.log('Preexisting user-suggested value');
          if (formValues.value != 'other') {
            formValues.other_value = formValues.value + '';
            formValues.value = 'other';
          }
        }
      } else {
        console.error('Multiple value matches detected. This shouldn\'t be happening.');
      }

    } else if (this.value.data_type === 'Country') {
      let sel = this.multiSelectedCountries.map(country => country.code);
      sel = sel.sort();
      const specials = ['all', 'other', 'na'];
      // all > other > na as per discussions
      if (sel.filter(value => !specials.includes(value)).length > 0) {
        formValues.value = sel.filter(value => !specials.includes(value)).sort().toString();
      } else if (sel.includes('all')) {
        formValues.value = 'all';
      } else if (sel.includes('other')) {
        formValues.value = 'other';
      } else if (sel.includes('na')) {
        formValues.value = 'na';
      } else {
        formValues.value = 'regionSaveError';
      }
    } else if (this.value.data_type === 'Tags') {
      formValues.valueHasTags = true;
      formValues.value = 'tags';
      this.selectedTags = this.selectedTags.map(tag => tag.toLowerCase());
      formValues.other_value = this.selectedTags.sort().toString();
    }

    if (formValues && formValues.fine_grained_location_selector == 'default') {
      formValues.fine_grained_location = formValues.country;
    }

    if (formValues && formValues.approximate_date_selector == 'true') {
      formValues.approx_date_bool = 'true';
    } else {
      formValues.approx_date_bool = 'false';
    }

    return formValues;
  }

  // check to see if evidence can automatically link to event
  //   - if it can, do so
  //   - if it can't, open a dialog with options to promote or discard the evidence
  onSubmit(): void {
    this.sentToSave = true;
    this.sentToDiscard = false;
    this.saveLoading = true;
    const data = this.createSubmitObject();
    // (this.updateEvidence()).then
    this.apiService.updateCandidateEvidence(data, this.evidence.evid_id, this.evidence.sent_id).then((response) => {
      if (response.match_found === 'false') { // no match
        this.snackBar.open('The candidate evidence was updated. It was not matched to any event.', 'Dismiss', {
              duration: this.snackBarTimeOut,
              verticalPosition:  this.snackBarVerticalPosition,
              horizontalPosition: this.snackBarHorizontalPosition
        });
        this.openDialog();
      } else { // candidate evidence matched to existing event
          let popup_text = '';
          if (response.evidence_updated === 'true') {
              popup_text = 'Added evidence to event';
            } else {
              popup_text = 'Evidence already exists';
            }
          this.evidence.event_id = response.event.even_id;
          this.snackBar.open(popup_text, 'Dismiss', {
            duration: this.snackBarTimeOut,
            verticalPosition:  this.snackBarVerticalPosition,
            horizontalPosition: this.snackBarHorizontalPosition
          });
      }
    }).then((response) => this.apiService.checkAssociation(data, this.evidence.evid_id, this.evidence.sent_id)).then((response) => {
      if (response.match_found === 'false') { // no match

      } else { // candidate evidence matched to existing event
        this.openEvidenceDialog(response);
        // this.updateEvidence();
      }
    }).catch((error: Error) => {
      this.saveLoading = false;
    });
  }

  findMatches(): void {
    this.showEventLoading = true;
    const data = this.createSubmitObject();
    this.apiService.getEvent(data, this.evidence.even_id, this.evidence.sent_id).then((response) => {
      if (response.match_found === 'true') { // no match
        this.openEvidenceDialog(response);
      } else { // candidate evidence matched to existing event
        this.snackBar.open('No match found.', 'Dismiss', {
          duration: this.snackBarTimeOut,
          verticalPosition:  this.snackBarVerticalPosition,
          horizontalPosition: this.snackBarHorizontalPosition
        });
        this.showEventLoading = false;
      }
    }).catch((error: Error) => {
      this.showEventLoading = false;
    });
  }

    private promoteToEvent(): void {
    this.saveLoading = true;
    const data = this.createSubmitObject();
    this.apiService.promoteToEvent(data, this.evidence.evid_id).then((response) => {

      if (response.event_created === 'true') {
        this.snackBar.open('The candidate evidence was promoted to an event.', 'Dismiss', {
          duration: this.snackBarTimeOut,
          verticalPosition:  this.snackBarVerticalPosition,
          horizontalPosition: this.snackBarHorizontalPosition
        });
        this.evidence.even_id = response.even_id;
        this.saveLoading = false;
      }
    }).catch((error: Error) => {
      this.saveLoading = false;
    });
  }




  // discard an evidence entirely
  discardCandidateEvidence(): void {
    this.discardLoading = true;
    this.sentToSave = false;
    this.sentToDiscard = true;
    this.apiService.discardCandidateEvidence({}, this.evidence.evid_id).then((response) => {
      // Following code removes the box after updated. Based on new requirements on May 27, we don't want it to go.

      this.snackBar.open('The candidate evidence was discarded.', 'Dismiss', {
          duration: this.snackBarTimeOut,
          verticalPosition:  this.snackBarVerticalPosition,
          horizontalPosition: this.snackBarHorizontalPosition
      });
      this.discardLoading = false;
    }).catch((error: Error) => {
      this.discardLoading = false;
    });
  }

  // deletes existing evidence from the database
  deleteEvidence(evidenceID: string): void {
    // this.discardLoading = true;
    // this.sentToSave = false;
    // this.sentToDiscard = true;
    const data = this.createSubmitObject();
    this.apiService.deleteEvidence(data, evidenceID).then((response) => {

      this.snackBar.open('The evidence was deleted.', 'Dismiss', {
        duration: this.snackBarTimeOut,
        verticalPosition: this.snackBarVerticalPosition,
        horizontalPosition: this.snackBarHorizontalPosition
      });
    }).catch((error: Error) => {
      this.snackBar.open(`Error deleting evidence data for ID: ${evidenceID}`, 'Dismiss', {
        duration: this.snackBarTimeOut,
        verticalPosition: this.snackBarVerticalPosition,
        horizontalPosition: this.snackBarHorizontalPosition
      });
    });
  }


  // focus on text
  focusOnText(): void {
    // TextArea on the top of the page
    const textArea = (document.getElementById('doc_textarea') as HTMLTextAreaElement);
    const selectionStart = this.evidence.begin_offset;
    const selectionEnd   = this.evidence.end_offset;
    // focus on the element
    textArea.blur();
    textArea.focus();

    // This is a hack because Chrome has issue with scrolling to the right location
    const fullText = textArea.value;
    textArea.value = fullText.substring(0, selectionEnd);
    textArea.scrollTop = 0;
    textArea.scrollTop = textArea.scrollHeight;
    textArea.value = fullText;

    // Highlighting the selection Range
    textArea.setSelectionRange(selectionStart, selectionEnd);
  }


  // dialog that opens if an evidence cannot be linked to an event
  openDialog() {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.disableClose = true;
    const open = this.dialog.open(UncategorizedDialogComponent, dialogConfig);
    const dialogRef = open;
    dialogRef.afterClosed().subscribe(
        data => {
          if (data === 'promote') {
            this.promoteToEvent();
          } else if (data === 'discard') {
              this.sentToSave = false;
              this.sentToDiscard = true;
              this.saveLoading = false;
              this.discardCandidateEvidence();
          } else if (data === 'cancel') {
              this.sentToSave = false;
              this.sentToDiscard = false;
              this.saveLoading = false;
          }
        }
    );
  }

  // dialog that opens if we have a conflict
  openEvidenceDialog(evidence) {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.disableClose = false;
    dialogConfig.height = '70%';
    dialogConfig.width = '50%';
    const open = this.dialog.open(EvidenceDialogComponent, dialogConfig);
    const dialogRef = open;
    dialogRef.componentInstance.data = evidence;

    dialogRef.afterClosed().subscribe(
        data => {
          this.saveLoading = false;
          this.showEventLoading = false;
        }
    );

    const sub = dialogRef.componentInstance.deletingEvidence.subscribe(data => {
      this.deleteEvidence(data);
    });
  }

  onFineLocationChangeOption() {
    this.fine_grained_location_selector = this.uncategorizedForm.controls.fine_grained_location_selector.value;

      // enable location
    if (this.fine_grained_location_selector == 'specific') {
      this.uncategorizedForm.controls.fine_grained_location.setValue(
                                                          this.evidence.fine_grained_location
                                                          );
      this.uncategorizedForm.controls.fine_grained_location.enable();
    }
    // disable location
    if (this.fine_grained_location_selector == 'default') {
      this.uncategorizedForm.controls.fine_grained_location.setValue(
                                                        this.uncategorizedForm.controls.country.value
                                                      );
      this.uncategorizedForm.controls.fine_grained_location.disable();
    }
  }

  addTag(event: MatChipInputEvent): void {
    const input = event.input;
    const value = event.value.toLowerCase();
    if ((value || '').trim() && !this.selectedTags.includes(value.trim())) {
      this.selectedTags.push(value.trim());
    }

    if (input) {
      input.value = '';
    }
    this.uncategorizedForm.controls.value.setValue(this.selectedTags.toString());
  }

  removeTag(tag: string): void {
    const index = this.selectedTags.indexOf(tag);

    if (index >= 0) {
      this.selectedTags.splice(index, 1);
    }
    this.uncategorizedForm.controls.value.setValue(this.selectedTags.toString());
  }

  selectTag(event: MatAutocompleteSelectedEvent): void {
    if (!this.selectedTags.includes(event.option.viewValue)) {
      this.selectedTags.push(event.option.viewValue);
    }
    this.tagInput.nativeElement.value = '';
    this.uncategorizedForm.controls.value.setValue(this.selectedTags.toString());
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.value.categories.filter(tag => tag.value.toLowerCase().indexOf(filterValue) === 0);
  }

}
