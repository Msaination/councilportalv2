(function (Joomla, document) {
	'use strict';

	const optionKey = 'com_phocadownload.externalUrlParser';
	const fields = {
		button: 'phocadownload-external-url-parse',
		externalUrl: 'jform_link_external',
		filename: 'jform_filename',
		projectName: 'jform_project_name',
		version: 'jform_version',
		directLink: 'jform_directlink',
		date: 'jform_date',
		publishUp: 'jform_publish_up',
	};

	const triggerChange = (element) => {
		element.dispatchEvent(new Event('input', { bubbles: true }));
		element.dispatchEvent(new Event('change', { bubbles: true }));
	};

	const setFieldValue = (id, value) => {
		const element = document.getElementById(id);

		if (!element || value === null || value === undefined) {
			return;
		}

		element.value = value;

		if (id === fields.date || id === fields.publishUp) {
			element.setAttribute('data-alt-value', value);
		}

		triggerChange(element);
	};

	const getMessage = (key, fallback) => {
		if (Joomla.Text && typeof Joomla.Text._ === 'function') {
			return Joomla.Text._(key, fallback);
		}

		return fallback;
	};

	const showError = (message) => {
		if (typeof Joomla.renderMessages === 'function') {
			Joomla.renderMessages({
				error: [message],
			});

			return;
		}

		window.alert(message);
	};

	const pad = (value) => String(value).padStart(2, '0');

	const formatDate = (date) => [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
	].join('-') + ' ' + [
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join(':');

	const formatVersion = (version, format) => {
		const normalized = version.replace(/^v(?=\d)/i, '');

		if (format === 'major') {
			return normalized.split('.')[0] || normalized;
		}

		if (format === 'minor') {
			const parts = normalized.split('.');

			return parts.length > 1 ? parts.slice(0, 2).join('.') : normalized;
		}

		return normalized;
	};

	const parseUrl = (value, versionFormat) => {
		const parsedUrl = new URL(value);
		const segments = parsedUrl.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
		const downloadIndex = segments.findIndex((segment, index) => segment === 'download' && segments[index - 1] === 'releases');
		const filename = segments.length ? segments[segments.length - 1] : '';

		if (!filename) {
			throw new Error(getMessage('COM_PHOCADOWNLOAD_EXTERNAL_URL_PARSE_URL_INVALID', 'The external URL cannot be parsed.'));
		}

		return {
			filename,
			projectName: segments[1] || '',
			version: downloadIndex > -1 && segments[downloadIndex + 1] ? formatVersion(segments[downloadIndex + 1], versionFormat) : '',
		};
	};

	document.addEventListener('DOMContentLoaded', () => {
		const button = document.getElementById(fields.button);
		const externalUrl = document.getElementById(fields.externalUrl);

		if (!button || !externalUrl) {
			return;
		}

		button.addEventListener('click', () => {
			const options = Joomla.getOptions ? Joomla.getOptions(optionKey, {}) : {};
			const value = externalUrl.value.trim();

			if (!value) {
				showError(getMessage('COM_PHOCADOWNLOAD_EXTERNAL_URL_PARSE_URL_EMPTY', 'Please enter the external URL first.'));
				return;
			}

			try {
				const data = parseUrl(value, options.versionFormat || 'full');
				const date = new Date();
				const offset = Number.parseInt(options.dateOffsetHours, 10);

				if (!Number.isNaN(offset)) {
					date.setHours(date.getHours() + offset);
				}

				const formattedDate = formatDate(date);

				setFieldValue(fields.filename, data.filename);
				setFieldValue(fields.projectName, data.projectName);
				setFieldValue(fields.version, data.version);
				setFieldValue(fields.directLink, '1');
				setFieldValue(fields.date, formattedDate);

				if (Number.parseInt(options.copyDateToPublishUp, 10) === 1) {
					setFieldValue(fields.publishUp, formattedDate);
				}
			} catch (error) {
				showError(getMessage('COM_PHOCADOWNLOAD_EXTERNAL_URL_PARSE_ERROR', 'The external URL cannot be parsed.'));
			}
		});
	});
})(Joomla, document);
