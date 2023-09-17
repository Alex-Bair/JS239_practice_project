document.addEventListener('DOMContentLoaded', event =>{
  class APIInterface {
    async getAllContacts() {
      try {
        let response = await fetch('/api/contacts', {method: 'GET'});

        return response.json();
      } catch (error) {
        console.log(`The fetch was unsuccessful: ${error}`);
      }
    }

    async createNewContact(queryString) {
      try {
        let response = await fetch('/api/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          },
          body: queryString,
        });

        return response.json();
      } catch (error) {
        console.log(`Unable to create contact: ${error}`);
      }
    }
    
    async updateContact(queryString) {
      try {
        let response = await fetch(`/api/contacts/${queryString.get('id')}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          },
          body: queryString,
        });

        return response.json();
      } catch (error) {
        console.log(`Unable to update contact ${queryString.get('id')}: ${error}`);
      }
    }

    async deleteContact(id) {
      try {
        let response = await fetch(`/api/contacts/${id}`, {method: 'DELETE'});

        return response.status;
      } catch (error) {
        console.log(`Unable to delete contact ${id}: ${error}`);
      }
    }
  }

  class HandlebarsHelper {
    constructor() {
      this.templates = null;
      this.setUpHandlebars();
    }

    setUpHandlebars() {
      let scriptElements = Array.from(document.querySelectorAll('[type="text/x-handlebars"]'));
      this.registerPartials(scriptElements);
      this.compileTemplates(scriptElements);
      this.registerHelpers();
      scriptElements.forEach(e => e.remove());
    }

    registerHelpers() {
      Handlebars.registerHelper('at_least_one_contact', function() {
        return this.contacts.length >= 1;
      });

      Handlebars.registerHelper('at_least_one_tag', function() {
        return this.tags.length >= 1;
      });
    }

    registerPartials(scriptElements) {
      scriptElements = scriptElements.filter(element => element.dataset.handlebarsType === 'partial');
      scriptElements.forEach(e => {
        Handlebars.registerPartial(e.dataset.id, e.innerHTML);
      });
    }

    compileTemplates(scriptElements) {
      this.templates = scriptElements.reduce((acc, script) => {
        acc[script.dataset.id] = Handlebars.compile(script.innerHTML);
        return acc;
      }, {});
    }
  }

  class ViewHelper {
    constructor(mainApp) {
      this.mainApp = mainApp;
      this.templates = (new HandlebarsHelper()).templates;
      this.contactsContainer = document.querySelector('[data-id="contacts_container"]');
      this.contactsSection = document.querySelector('section[data-id="contacts_view"]');
      this.formSection = document.querySelector('section[data-id="form_view"]');
    }

    hideFormShowContacts() {
      this.formSection.classList.add('hidden');
      this.contactsSection.classList.remove('hidden');
    }

    hideContactsShowForm(contact, type) {
      this.contactsSection.classList.add('hidden');
      this.formSection.innerHTML = this.templates['contact_form'](contact);
      this.formSection.querySelector('span').textContent = (type === 'add' ? 'Create' : 'Edit');
      this.formSection.classList.remove('hidden');
    }

    setErrorMessages(form) {
      let visibleInputs = form.querySelectorAll('input:not([type="hidden"])');

      visibleInputs.forEach(input => {
        let label = input.previousElementSibling;
        let errorMessage = input.nextElementSibling;

        if (input.validity.valid) {
          label.classList.remove('invalid');
          input.classList.remove('invalid');
          errorMessage.classList.add('hidden');
        } else {
          label.classList.add('invalid');
          input.classList.add('invalid');
          errorMessage.classList.remove('hidden');
        }
      });
    }

    showSearchResults(contactList = [], input, message) {
      let contactElements = this.contactsContainer.querySelectorAll('div.contact');

      if (arguments.length === 0) {
        contactElements.forEach(e => e.classList.remove('hidden'));

        input = this.mainApp.searchContainer.querySelector('input[type="text"]');
        message = document.querySelector('[data-id="search_message"]');
      } else {
        let contactIds = contactList.map(contact => String(contact.id));

        contactElements.forEach(e => {
          if (contactIds.includes(e.dataset.contactId)) {
            e.classList.remove('hidden');
          } else {
            e.classList.add('hidden');
          }
        });
      }

      this.handleEmptySearchOrNoMatches(input.value, contactList);
    }

    handleEmptySearchOrNoMatches(searchTerm, contactList) {
      let message = document.querySelector('[data-id="search_message"]');

      if (searchTerm === '' || this.mainApp.contacts.length === 0) {
        return;
      } else if (contactList.length === 0) {
        let searchTermSpan = message.querySelector('span[data-id="search_term"]');

        message.classList.remove('hidden');
        searchTermSpan.textContent = searchTerm;
      } else {
        message.classList.add('hidden');
      }
    }

    buildContactList() {
      this.contactsContainer.innerHTML = this.templates['contacts_list']({ contacts: this.mainApp.contacts });
    }

    async refreshContactList() {
      this.mainApp.contacts = await this.mainApp.apiLink.getAllContacts();
      this.buildContactList();
    }
  }

  class App {
    constructor() {
      this.apiLink = new APIInterface();
      this.contacts = null;
      this.viewHelper = new ViewHelper(this);
      this.searchContainer = document.querySelector('search[data-id="search_container"]');
      this.viewHelper.refreshContactList();
      this.bindEvents();
    }

    debounce(func, delay) {
      let timeout;
      return (...args) => {
        if (timeout) {clearTimeout(timeout)}
        timeout = setTimeout(() => func.apply(null, args), delay);
      };
    }

    buildContact(buttonElement, buttonType) {
      const EMPTY_CONTACT = {
          id: '',
          full_name: '',
          email: '',
          phone_number: '',
          tags: '',
        };

      if (buttonType !== 'edit') return EMPTY_CONTACT;

      let div = buttonElement.parentNode.parentNode;
      let contact = {
        id: div.dataset.contactId,
        full_name: div.querySelector('[data-contact-full-name]').dataset.contactFullName,
        phone_number: div.querySelector('[data-contact-phone-number]').dataset.contactPhoneNumber,
        email: div.querySelector('[data-contact-email]').dataset.contactEmail,
      };

      let tagsElement = div.querySelector('[data-contact-tags]');

      contact.tags = (tagsElement ? div.querySelector('[data-contact-tags]').dataset.contactTags : null);

      return contact;
    }

    handleClick(event) {
      let targetTagName = event.target.tagName;

      if (targetTagName === 'BUTTON' && event.target.dataset.type) {
        this.handleButtonClick(event);
      }
    }

    async handleButtonClick(event) {
      let buttonType = event.target.dataset.type;
      let contactId = event.target.parentNode.parentNode.dataset.contactId;
      let contact = this.buildContact(event.target, buttonType);

      if (buttonType === 'add' || buttonType === 'edit') {
        this.viewHelper.hideContactsShowForm(contact, buttonType);
      } else if (buttonType === 'delete' && confirm('Do you want to delete this contact?')) {
        await this.apiLink.deleteContact(contactId);
        this.viewHelper.refreshContactList();
      } else if (buttonType === 'cancel') {
        this.viewHelper.hideFormShowContacts();
      }
    }

    async submitForm(form) {
      let data = new URLSearchParams(new FormData(form));
      let id = data.get('id');

      if (id) {
        await this.apiLink.updateContact(data);
      } else {
        data.delete('id');
        await this.apiLink.createNewContact(data);
      }

      this.viewHelper.refreshContactList();
      this.viewHelper.hideFormShowContacts();
    }

    handleFormSubmit(event) {
      event.preventDefault();

      let form = event.target;
      
      if (!form.checkValidity()) {
        this.viewHelper.setErrorMessages(form);
      } else {
        this.submitForm(form);
      }
    }

    filterContacts(searchTerm, searchType) {
      return this.contacts.filter(contactObj =>{
        if (searchType === 'full_name') {
          return contactObj['full_name'].toLowerCase().includes(searchTerm.toLowerCase());
        } else if (searchType === 'tag') {
          if (!contactObj['tags']) return false;
          return contactObj['tags'].split(',').map(tag => tag.toLowerCase()).some(tag => tag.includes(searchTerm.toLowerCase()));
        }
      });
    }

    handleSearchUpdate(event) {
      let searchInput = this.searchContainer.querySelector('input[type="text"]');
      let searchType = this.searchContainer.querySelector('input:checked').value;
      let searchMessage = document.querySelector('[data-id="search_message"]');

      if (searchInput.value === '' || this.contacts.length === 0) {
        searchMessage.classList.add('hidden');
        this.viewHelper.showSearchResults();
        return;
      }

      let selectedContacts = this.filterContacts(searchInput.value, searchType);

      this.viewHelper.showSearchResults(selectedContacts, searchInput, searchMessage);
    }

    handleKeyPress(event) {
      const IGNORED_KEYS = ['Control', 'Tab', 'Backspace', 'Delete', 'Shift', 'Alt', 'Meta', 'Escape'];

      if (IGNORED_KEYS.includes(event.key)) return;

      let inputId = event.target.id;

      if (inputId === 'phone_number') {
        if (!event.key.match(/\d/)) event.preventDefault();
      } else if (inputId === 'tags') {
        if (event.key === ' ') event.preventDefault();
      }
    }

    bindEvents() {
      document.querySelector('main').addEventListener('click', this.handleClick.bind(this));
      document.querySelector('section[data-id="form_view"]').addEventListener('submit', this.handleFormSubmit.bind(this));
      this.searchContainer.addEventListener('input', this.debounce(this.handleSearchUpdate.bind(this), 300));
      document.querySelector('section[data-id="form_view"]').addEventListener('keydown', this.handleKeyPress.bind(this));
    }
  }

  new App();
})