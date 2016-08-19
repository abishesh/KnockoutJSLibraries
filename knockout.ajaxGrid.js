(function ($, ko) {

    // Private function
    function getColumnsForScaffolding(data) {
        if ((typeof data.length !== 'number') || data.length === 0) {
            return [];
        }
        var columns = [];
        for (var propertyName in data[0]) {
            columns.push({ headerText: propertyName, rowText: propertyName });
        }
        return columns;
    }

    var sortFieldModel = function (field, isAscending) {
        var me = this;
        me.field = field || '';
        me.isAscending = isAscending;
        me.toJson = function () {
            var result = {};
            if (me.field === '') return result;
            result[me.field] = me.isAscending ? "asc" : "desc";
            return result;
        };
    };

    ko.simpleGrid = {
        // Defines a view model class you can use to populate a grid
        viewModel: function (configuration) {
            var self = this;
            self.baseURL = configuration.baseURL || '';
            self.pageSize = configuration.pageSize || 5;
            self.url = configuration.url;
            self.sortField = ko.observable(configuration.sortField);
            self.showSearchBar = configuration.showSearchBar || false;
            self.pagerSize = configuration.pagerSize || 5;

            self.currentPageIndex = ko.observable(0);
            self.totalPages = ko.observable(0);
            self.filters = ko.observable();
            self.itemIdToDelete = ko.observable();
            self.isLoading = ko.observable(false);

            self.fromRow = 0;
            self.sort = function (field) {
                var sort = {};
                if (self.sortField() == undefined) {
                    sort[field] = "asc";
                    self.sortField(sort);
                }
                else {
                    if (self.sortField()[field] === "asc") {
                        sort[field] = "desc";
                        self.sortField(sort);
                    }
                    else {
                        sort[field] = "asc";
                        self.sortField(sort);
                    }
                }
                self.currentPageIndex(0);
                return { direction: sort[field] };
            };

            self.searchCriteria = ko.computed(function () {
                var criteria = {
                    pageIndex: self.currentPageIndex() + 1,
                    pageSize: self.pageSize,
                    filters: self.filters(),
                    sortFields: self.sortField(),
                    itemIdToDelete: self.itemIdToDelete()
                };

                return criteria;
            }, self);

            self.result = asyncComputed(function () {
                var criteriaJson = JSON.stringify(self.searchCriteria());

                var options = {
                    contentType: "application/json;charset=utf-8",
                    type: 'POST',
                    data: criteriaJson
                };

                var antiForgeryToken = $("input[name='__RequestVerificationToken']").val();

                if (antiForgeryToken) {
                    options.headers = { 'RequestVerificationToken': antiForgeryToken };
                }
                return $.ajax(self.url, options);
            }, self);

            function asyncComputed(evaluator, owner) {
                var result = ko.observable();
                result.records = ko.observableArray();
                result.totalRecords = ko.observable();
                result.toRow = ko.observable(0);
                result.fromRow = ko.observable(0);
                owner.isLoading(true);
                ko.computed(function () {
                    // Get the $.Deferred value, and then set up a callback so that when it's done,
                    // the output is transferred onto our "result" observable
                    evaluator.call(owner).done(function (res) {
                        result.records(res.records);
                        //if rowNum is present it is used 
                        if (res.records && res.records.length > 0 && res.records[0].RowNum) {
                            result.fromRow(res.records[0].RowNum);
                            result.toRow(res.records[res.records.length - 1].RowNum);
                        } else {
                            result.fromRow(owner.currentPageIndex() * owner.pageSize + 1);
                            var toRow = (owner.currentPageIndex() + 1) * owner.pageSize;
                            result.toRow(toRow <= res.totalRecords ? toRow : res.totalRecords);
                        }
                        result.totalRecords(res.totalRecords);
                        result(res);
                        owner.isLoading(false);
                        var cols = configuration.columns || getColumnsForScaffolding(ko.utils.unwrapObservable(self.result.records()));
                        self.columns(cols);
                    });
                });
               
                return result;
            }

            // If you don't specify columns configuration, we'll use scaffolding
            self.columns = ko.observable(configuration.columns || getColumnsForScaffolding(ko.utils.unwrapObservable(self.result.records())));

            self.maxPageIndex = ko.computed(function () {
                return Math.ceil(self.result.totalRecords() / self.pageSize) - 1;
            }, self);

            self.pagers = ko.computed(function () {
                var a = self.pagerSize;
                var start = Math.floor(self.currentPageIndex() / a) * a;
                var end = start + 4;
                if (end < self.maxPageIndex()) {
                    return ko.utils.range(start, end);
                }

                return ko.utils.range(start, self.maxPageIndex());
            });

            self.next = function () {
                var a = self.pagerSize;
                var first = Math.floor(self.currentPageIndex() / a) * a + a;
                if (first <= self.maxPageIndex()) {
                    self.currentPageIndex(first);
                }
            };

            self.previous = function () {
                var first = self.currentPageIndex() - self.pagerSize;
                if (first > 0) {
                    self.currentPageIndex(first);
                } else {
                    self.currentPageIndex(0);
                }
            };

            self.hasPrevious = ko.computed(function () {
                var limit = self.pagerSize - 1;
                return self.currentPageIndex() > limit;
            });

            self.hasNext = ko.computed(function () {
                var a = self.pagerSize;
                var current = Math.floor(self.currentPageIndex() / a) * a;
                var limit = Math.floor(self.maxPageIndex() / a) * a;
                return current < limit;
            });

         }
    };

    // Templates used to render the grid
    var templateEngine = new ko.nativeTemplateEngine();

    templateEngine.addTemplate = function (templateName, templateMarkup) {
        document.write("<script type='text/html' id='" + templateName + "'>" + templateMarkup + "<" + "/script>");
    };

    templateEngine.addTemplate("ko_simpleGrid_search", "<div class=\"row\">\
              <div class=\"col-lg-offset-8\">\
                <div class=\"input-group\">\
                  <input type=\"text\" class=\"form-control\" data-bind=\"value:searchCriteria\">\
                  <span class=\"input-group-btn\">\
                    <button class=\"btn btn-default\" type=\"button\" data-bind=\"click: $root.go\">Go!</button>\
                  </span>\
                </div>\
              </div>\
              <br/>\
            </div>");

    templateEngine.addTemplate("ko_simpleGrid_grid", "\
        <div data-bind=\"visible:isLoading\" class=\"text-center\" style=\"margin:.5em;\"><span class=\" badge alert-info\"><h5><strong><span class=\"glyphicon glyphicon-refresh\"/>&nbsp;Loading...</strong></h5></span></div>\
        <table class=\"ko-grid table\">\
                        <thead>\
                            <tr data-bind=\"foreach: columns\">\
                               <th data-bind=\"text: headerText\"></th>\
                            </tr>\
                        </thead>\
                        <tbody data-bind=\"foreach: result.records\">\
                           <tr data-bind=\"foreach: $parent.columns\">\
                               <td data-bind=\"text: typeof rowText == 'function' ? rowText($parent) : $parent[rowText] \"></td>\
                            </tr>\
                        </tbody>\
                    </table>");

    templateEngine.addTemplate("ko_simpleGrid_pageLinks", "\
                    <div class=\"ko-grid-pageLinks\" data-bind=\"visible:!isLoading\">\
                        <span>Page:</span>\
                        <!-- ko foreach: ko.utils.range(0, maxPageIndex) -->\
                               <a href=\"#\" data-bind=\"text: $data + 1, click: function() { $root.currentPageIndex($data) }, css: { selected: $data == $root.currentPageIndex() }\">\
                            </a>\
                        <!-- /ko -->\
                    </div>");

    // The "simpleGrid" binding 
    ko.bindingHandlers.simpleGrid = {
        init: function () {
            return { 'controlsDescendantBindings': true };
        },
        // This method is called to initialize the node, and will also be called again if you change what the grid is bound to
        update: function (element, viewModelAccessor, allBindingsAccessor) {
            var viewModel = viewModelAccessor(), allBindings = allBindingsAccessor();

            // Empty the element
            while (element.firstChild)
                ko.removeNode(element.firstChild);

            // Allow the default templates to be overridden
            var gridTemplateName = allBindings.simpleGridTemplate || "ko_simpleGrid_grid",
                pageLinksTemplateName = allBindings.simpleGridPagerTemplate || "ko_simpleGrid_pageLinks";

            if (viewModel.showSearchBar) {
                // Render the search bar
                var searchContainer = element.appendChild(document.createElement("DIV"));
                ko.renderTemplate("ko_simpleGrid_search", viewModel, { templateEngine: templateEngine }, searchContainer, "replaceNode");
            }

            // Render the main grid
            var gridContainer = element.appendChild(document.createElement("DIV"));
            ko.renderTemplate(gridTemplateName, viewModel, { templateEngine: templateEngine }, gridContainer, "replaceNode");

            // Render the page links
            var pageLinksContainer = element.appendChild(document.createElement("DIV"));
            ko.renderTemplate(pageLinksTemplateName, viewModel, { templateEngine: templateEngine }, pageLinksContainer, "replaceNode");

            $(element).delegate(".sort", "click", element, bindSort);

            var options = allBindings.resizecolumn;
            if (options && options.resizable && !viewModel.isLoading()) {
                $(element.children[0]).css('height', $(window).height() - 350).css('overflow-y', 'scroll')
                $(options.selector).colResizable({
                    liveDrag: true
                });
            }
        }
    };


    
    function bindSort(event) {
        //retrieve the context
        var sortField = $(this).attr("sortColumn");
        var ret = ko.contextFor(this).$root.sort(sortField);
        //clear all sort direction classes - background color here for example


        /* $(event.data).find("span.sort").css("background-position", '');
         if (ret && ret.direction) {
             var bgColor = ret.direction === "asc" ? "right center" : "right bottom";
             $(this).css("background-position", bgColor);
         }*/
        $(event.data).find("span.sort").removeClass("sort-asc sort-desc");
        if (ret && ret.direction) {
            var mySortClass = ret.direction === "asc" ? "sort-asc" : "sort-desc";
            $(this).addClass(mySortClass);
        }
        return false;
    }

})(jQuery, ko);